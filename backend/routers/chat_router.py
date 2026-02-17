import asyncio
import json
import logging
import time
from contextlib import AsyncExitStack
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sse_starlette.sse import EventSourceResponse

from config import DATABASE_TYPE
from database import get_db
from models import Session as SessionModel, Message, Agent, LLMProvider, ToolDefinition, Team, MCPServer, FileAttachment
from schemas import ChatRequest
from auth import get_current_user, TokenData
from encryption import decrypt_api_key
from llm.base import LLMMessage
from llm.provider_factory import create_provider_from_config
from mcp_client import connect_mcp_server, parse_mcp_tool_name, MCPConnection
from file_storage import FileStorageService
from rag_service import RAGService

if DATABASE_TYPE == "mongo":
    from database_mongo import get_database
    from models_mongo import SessionCollection, MessageCollection, AgentCollection, LLMProviderCollection, ToolDefinitionCollection, TeamCollection, MCPServerCollection, FileAttachmentCollection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_TOOL_ROUNDS = 10

TOOL_RESULT_PROMPT = (
    "Use this information to answer the user's question."
)


def _execute_python_tool(code_str: str, arguments: dict) -> str:
    """Execute a Python tool handler and return the result as a string."""
    try:
        local_ns: dict = {}
        exec(code_str, {"__builtins__": __builtins__}, local_ns)
        handler_fn = local_ns.get("handler")
        if not handler_fn:
            return json.dumps({"error": "No 'handler' function found in tool code"})
        result = handler_fn(arguments)
        return json.dumps(result) if isinstance(result, (dict, list)) else str(result)
    except Exception as e:
        return json.dumps({"error": str(e)})


def _execute_tool(tool_name: str, arguments_str: str, db) -> str:
    """Look up a tool by name and execute it, returning the result string."""
    try:
        arguments = json.loads(arguments_str) if arguments_str else {}
    except json.JSONDecodeError:
        arguments = {}

    tool_def = db.query(ToolDefinition).filter(
        ToolDefinition.name == tool_name,
        ToolDefinition.is_active == True,
    ).first()

    if not tool_def:
        return json.dumps({"error": f"Tool '{tool_name}' not found"})

    if tool_def.handler_type == "python":
        config = json.loads(tool_def.handler_config) if tool_def.handler_config else {}
        code_str = config.get("code", "")
        if not code_str:
            return json.dumps({"error": "No code configured for this tool"})
        return _execute_python_tool(code_str, arguments)

    elif tool_def.handler_type == "http":
        import httpx
        config = json.loads(tool_def.handler_config) if tool_def.handler_config else {}
        url = config.get("url", "")
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        if not url:
            return json.dumps({"error": "No URL configured for this tool"})
        try:
            with httpx.Client(timeout=30.0) as client:
                if method == "GET":
                    resp = client.get(url, params=arguments, headers=headers)
                else:
                    resp = client.request(method, url, json=arguments, headers=headers)
                return resp.text
        except Exception as e:
            return json.dumps({"error": f"HTTP request failed: {e}"})

    return json.dumps({"error": f"Unsupported handler type: {tool_def.handler_type}"})


async def _execute_tool_mongo(tool_name: str, arguments_str: str, mongo_db) -> str:
    """Look up a tool by name in MongoDB and execute it."""
    try:
        arguments = json.loads(arguments_str) if arguments_str else {}
    except json.JSONDecodeError:
        arguments = {}

    collection = mongo_db[ToolDefinitionCollection.collection_name]
    tool_def = await collection.find_one({"name": tool_name, "is_active": True})

    if not tool_def:
        return json.dumps({"error": f"Tool '{tool_name}' not found"})

    handler_type = tool_def.get("handler_type", "")
    handler_config_raw = tool_def.get("handler_config")
    if isinstance(handler_config_raw, str):
        try:
            config = json.loads(handler_config_raw)
        except json.JSONDecodeError:
            config = {}
    elif isinstance(handler_config_raw, dict):
        config = handler_config_raw
    else:
        config = {}

    if handler_type == "python":
        code_str = config.get("code", "")
        if not code_str:
            return json.dumps({"error": "No code configured for this tool"})
        return _execute_python_tool(code_str, arguments)

    elif handler_type == "http":
        import httpx
        url = config.get("url", "")
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        if not url:
            return json.dumps({"error": "No URL configured for this tool"})
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method == "GET":
                    resp = await client.get(url, params=arguments, headers=headers)
                else:
                    resp = await client.request(method, url, json=arguments, headers=headers)
                return resp.text
        except Exception as e:
            return json.dumps({"error": f"HTTP request failed: {e}"})

    return json.dumps({"error": f"Unsupported handler type: {handler_type}"})


def _build_tools_for_llm(agent, db) -> list[dict] | None:
    """Retrieve agent's tool definitions and format them for the LLM (OpenAI-compatible format)."""
    if not agent.tools_json:
        return None
    try:
        tool_ids = json.loads(agent.tools_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if not tool_ids:
        return None

    tool_defs = db.query(ToolDefinition).filter(
        ToolDefinition.id.in_(tool_ids),
        ToolDefinition.is_active == True,
    ).all()

    if not tool_defs:
        return None

    tools = []
    for td in tool_defs:
        try:
            parameters = json.loads(td.parameters_json) if td.parameters_json else {"type": "object", "properties": {}}
        except json.JSONDecodeError:
            parameters = {"type": "object", "properties": {}}
        tools.append({
            "type": "function",
            "function": {
                "name": td.name,
                "description": td.description or "",
                "parameters": parameters,
            },
        })
    return tools if tools else None


def _load_mcp_server_configs(agent, db) -> list[dict]:
    """Load MCP server records for an agent's mcp_servers_json field (SQLite)."""
    if not agent.mcp_servers_json:
        return []
    try:
        server_ids = json.loads(agent.mcp_servers_json)
    except (json.JSONDecodeError, TypeError):
        return []
    if not server_ids:
        return []

    servers = db.query(MCPServer).filter(
        MCPServer.id.in_(server_ids),
        MCPServer.is_active == True,
    ).all()

    configs = []
    for s in servers:
        configs.append({
            "id": str(s.id),
            "name": s.name,
            "transport_type": s.transport_type,
            "command": s.command,
            "args_json": s.args_json,
            "env_json": s.env_json,
            "url": s.url,
            "headers_json": s.headers_json,
        })
    return configs


async def _load_mcp_server_configs_mongo(agent, mongo_db) -> list[dict]:
    """Load MCP server records from MongoDB for an agent."""
    mcp_raw = agent.get("mcp_servers_json") or agent.get("mcp_server_ids")
    if not mcp_raw:
        return []
    if isinstance(mcp_raw, str):
        try:
            server_ids = json.loads(mcp_raw)
        except (json.JSONDecodeError, TypeError):
            return []
    elif isinstance(mcp_raw, list):
        server_ids = mcp_raw
    else:
        return []
    if not server_ids:
        return []

    configs = []
    for sid in server_ids:
        server = await MCPServerCollection.find_by_id(mongo_db, str(sid))
        if server and server.get("is_active", True):
            server["id"] = str(server["_id"])
            configs.append(server)
    return configs


def _merge_tools(native_tools: list[dict] | None, mcp_tools: list[dict]) -> list[dict] | None:
    """Merge native tool definitions with MCP-discovered tools."""
    all_tools = list(native_tools or [])
    all_tools.extend(mcp_tools)
    return all_tools if all_tools else None


async def _execute_mcp_or_native_tool(
    tc_name: str, tc_arguments: str, mcp_connections: dict[str, MCPConnection], db
) -> str:
    """Route a tool call to either an MCP server or native tool handler."""
    parsed = parse_mcp_tool_name(tc_name)
    if parsed:
        server_name, original_tool_name = parsed
        conn = mcp_connections.get(server_name)
        if conn:
            try:
                args = json.loads(tc_arguments) if tc_arguments else {}
            except json.JSONDecodeError:
                args = {}
            return await conn.call_tool(original_tool_name, args)
        else:
            return json.dumps({"error": f"MCP server '{server_name}' not connected"})
    else:
        return _execute_tool(tc_name, tc_arguments, db)


async def _execute_mcp_or_native_tool_mongo(
    tc_name: str, tc_arguments: str, mcp_connections: dict[str, MCPConnection], mongo_db
) -> str:
    """Route a tool call to either an MCP server or native tool handler (MongoDB)."""
    parsed = parse_mcp_tool_name(tc_name)
    if parsed:
        server_name, original_tool_name = parsed
        conn = mcp_connections.get(server_name)
        if conn:
            try:
                args = json.loads(tc_arguments) if tc_arguments else {}
            except json.JSONDecodeError:
                args = {}
            return await conn.call_tool(original_tool_name, args)
        else:
            return json.dumps({"error": f"MCP server '{server_name}' not connected"})
    else:
        return await _execute_tool_mongo(tc_name, tc_arguments, mongo_db)


async def _connect_mcp_servers(stack: AsyncExitStack, mcp_server_configs: list[dict]) -> tuple[dict[str, MCPConnection], list[dict]]:
    """Connect to all MCP servers using an AsyncExitStack. Returns (connections_map, all_mcp_tools)."""
    mcp_connections: dict[str, MCPConnection] = {}
    all_mcp_tools: list[dict] = []
    for config in mcp_server_configs:
        try:
            conn = await stack.enter_async_context(connect_mcp_server(config))
            mcp_connections[conn.server_name] = conn
            all_mcp_tools.extend(conn.tools)
        except Exception as e:
            logger.warning(f"Failed to connect to MCP server {config.get('name')}: {e}")
    return mcp_connections, all_mcp_tools


# ---------------------------------------------------------------------------
# File attachment + RAG helpers
# ---------------------------------------------------------------------------

def _classify_file(media_type: str, filename: str) -> str:
    """Classify a file as 'image' or 'document'."""
    if media_type.startswith("image/"):
        return "image"
    return "document"


def _process_attachments_sqlite(attachments, session_id: int, user_id: int, db):
    """Process file attachments for SQLite mode.
    Returns (image_content_parts, attachment_records_json)."""
    image_parts = []
    attachment_records = []

    for att in attachments:
        file_type = _classify_file(att.media_type, att.filename)
        if not att.data:
            continue

        try:
            file_bytes, _ = FileStorageService.decode_data_uri(att.data)
        except Exception as e:
            logger.warning(f"Failed to decode attachment {att.filename}: {e}")
            continue

        storage_path = FileStorageService.save_file_sqlite(str(session_id), att.filename, file_bytes)

        file_record = FileAttachment(
            session_id=session_id,
            user_id=user_id,
            filename=att.filename,
            media_type=att.media_type,
            file_type=file_type,
            file_size=len(file_bytes),
            storage_path=storage_path,
        )
        db.add(file_record)
        db.flush()  # get the id

        attachment_records.append({
            "file_id": str(file_record.id),
            "filename": att.filename,
            "media_type": att.media_type,
            "file_type": file_type,
        })

        if file_type == "image":
            image_parts.append({
                "type": "image_url",
                "image_url": {"url": att.data},
            })
        elif file_type == "document":
            text = RAGService.extract_text(file_bytes, att.filename, att.media_type)
            if text.strip():
                RAGService.index_document(
                    str(session_id), text,
                    {"filename": att.filename, "media_type": att.media_type},
                )

    db.commit()
    return image_parts, attachment_records


async def _process_attachments_mongo(attachments, session_id: str, user_id: str, mongo_db):
    """Process file attachments for MongoDB mode (GridFS).
    Returns (image_content_parts, attachment_records_json)."""
    image_parts = []
    attachment_records = []

    for att in attachments:
        file_type = _classify_file(att.media_type, att.filename)
        if not att.data:
            continue

        try:
            file_bytes, _ = FileStorageService.decode_data_uri(att.data)
        except Exception as e:
            logger.warning(f"Failed to decode attachment {att.filename}: {e}")
            continue

        gridfs_id = await FileStorageService.save_file_gridfs(
            mongo_db, att.filename, file_bytes,
            {"session_id": session_id, "user_id": user_id, "media_type": att.media_type},
        )

        file_doc = await FileAttachmentCollection.create(mongo_db, {
            "session_id": session_id,
            "user_id": user_id,
            "filename": att.filename,
            "media_type": att.media_type,
            "file_type": file_type,
            "file_size": len(file_bytes),
            "gridfs_file_id": gridfs_id,
        })

        attachment_records.append({
            "file_id": str(file_doc["_id"]),
            "filename": att.filename,
            "media_type": att.media_type,
            "file_type": file_type,
        })

        if file_type == "image":
            image_parts.append({
                "type": "image_url",
                "image_url": {"url": att.data},
            })
        elif file_type == "document":
            text = RAGService.extract_text(file_bytes, att.filename, att.media_type)
            if text.strip():
                RAGService.index_document(
                    session_id, text,
                    {"filename": att.filename, "media_type": att.media_type},
                )

    return image_parts, attachment_records


def _build_user_llm_message(message_text: str, session_id: str, image_parts: list) -> LLMMessage:
    """Build an LLMMessage for the user, including RAG context and image parts."""
    rag_context = ""
    if RAGService.has_index(session_id):
        results = RAGService.search(session_id, message_text, top_k=5)
        if results:
            chunks = "\n\n".join(
                f"[From {r['metadata'].get('filename', 'document')}]:\n{r['text']}"
                for r in results
            )
            rag_context = f"\n\nRelevant context from uploaded documents:\n{chunks}"

    if image_parts:
        content_parts = [{"type": "text", "text": message_text + rag_context}]
        content_parts.extend(image_parts)
        return LLMMessage(role="user", content=content_parts)
    elif rag_context:
        return LLMMessage(role="user", content=message_text + rag_context)
    else:
        return LLMMessage(role="user", content=message_text)


@router.post("")
async def chat(
    request: ChatRequest,
    current_user: TokenData = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Streaming chat endpoint using SSE."""
    start_time = time.time()

    if DATABASE_TYPE == "mongo":
        return await _chat_mongo(request, current_user, start_time)
    return await _chat_sqlite(request, current_user, db, start_time)


async def _chat_sqlite(request: ChatRequest, current_user: TokenData, db: DBSession, start_time: float):
    # Load session
    session = db.query(SessionModel).filter(
        SessionModel.id == int(request.session_id),
        SessionModel.user_id == int(current_user.user_id),
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build message history
    past_messages = db.query(Message).filter(
        Message.session_id == int(request.session_id),
    ).order_by(Message.created_at.asc()).all()

    messages = []
    for msg in past_messages:
        if msg.role in ("user", "assistant"):
            messages.append(LLMMessage(role=msg.role, content=msg.content or ""))

    # Process attachments if present
    image_parts = []
    attachments_json = None
    if request.attachments:
        image_parts, attachment_records = _process_attachments_sqlite(
            request.attachments, int(request.session_id), int(current_user.user_id), db,
        )
        if attachment_records:
            attachments_json = json.dumps(attachment_records)

    # Save user message
    user_msg = Message(
        session_id=int(request.session_id),
        role="user",
        content=request.message,
        attachments_json=attachments_json,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # Add user message to history (with images + RAG context)
    messages.append(_build_user_llm_message(request.message, str(request.session_id), image_parts))

    # --- Team chat ---
    if session.entity_type == "team":
        team = db.query(Team).filter(Team.id == session.entity_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        agent_ids = json.loads(team.agent_ids_json) if team.agent_ids_json else []
        team_agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
        if not team_agents:
            raise HTTPException(status_code=400, detail="Team has no valid agents")

        # Build a map of agents with their providers ready
        agents_with_providers = []
        for ag in team_agents:
            if not ag.provider_id:
                continue
            pr = db.query(LLMProvider).filter(LLMProvider.id == ag.provider_id).first()
            if not pr:
                continue
            agents_with_providers.append((ag, pr))

        if not agents_with_providers:
            raise HTTPException(status_code=400, detail="No agents in team have a configured provider")

        mode = team.mode or "coordinate"
        session_id = int(request.session_id)

        if mode == "coordinate":
            return EventSourceResponse(
                _team_chat_coordinate(agents_with_providers, messages, db, session_id, start_time, request.message)
            )
        elif mode == "route":
            return EventSourceResponse(
                _team_chat_route(agents_with_providers, messages, db, session_id, start_time, request.message)
            )
        elif mode == "collaborate":
            return EventSourceResponse(
                _team_chat_collaborate(agents_with_providers, messages, db, session_id, start_time, request.message)
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown team mode: {mode}")

    # --- Agent chat ---
    agent = db.query(Agent).filter(Agent.id == session.entity_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.provider_id:
        raise HTTPException(status_code=400, detail="Agent has no provider configured")

    provider_record = db.query(LLMProvider).filter(LLMProvider.id == agent.provider_id).first()
    if not provider_record:
        raise HTTPException(status_code=404, detail="Provider not found")

    api_key = decrypt_api_key(provider_record.api_key) if provider_record.api_key else None
    config = json.loads(provider_record.config_json) if provider_record.config_json else None
    llm = create_provider_from_config(
        provider_type=provider_record.provider_type,
        api_key=api_key,
        base_url=provider_record.base_url,
        model_id=provider_record.model_id,
        config=config,
    )

    system_prompt = agent.system_prompt
    tools = _build_tools_for_llm(agent, db)
    mcp_server_configs = _load_mcp_server_configs(agent, db)

    if request.stream:
        if mcp_server_configs:
            return EventSourceResponse(
                _stream_response_with_mcp(llm, messages, system_prompt, db, int(request.session_id), agent.id, provider_record, start_time, tools, mcp_server_configs),
            )
        return EventSourceResponse(
            _stream_response(llm, messages, system_prompt, db, int(request.session_id), agent.id, provider_record, start_time, tools),
        )
    else:
        response = await llm.chat(messages, system_prompt=system_prompt, tools=tools)
        latency_ms = int((time.time() - start_time) * 1000)
        metadata = json.dumps({"model": provider_record.model_id, "provider": provider_record.provider_type, "latency_ms": latency_ms})
        assistant_msg = Message(
            session_id=int(request.session_id),
            role="assistant",
            content=response.content,
            agent_id=agent.id,
            metadata_json=metadata,
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        return {
            "id": str(assistant_msg.id),
            "session_id": request.session_id,
            "role": "assistant",
            "content": response.content,
            "metadata": json.loads(metadata),
            "created_at": assistant_msg.created_at.isoformat() if assistant_msg.created_at else None,
        }


async def _stream_response(llm, messages, system_prompt, db, session_id, agent_id, provider_record, start_time, tools=None):
    """Generator yielding SSE events for streaming response, with tool execution loop."""
    full_content = ""
    reasoning_parts = []
    tool_calls_collected = []  # accumulate tool calls from the current round

    try:
        for _round in range(MAX_TOOL_ROUNDS + 1):
            tool_calls_collected = []

            async for chunk in llm.chat_stream(messages, system_prompt=system_prompt, tools=tools):
                if chunk.type == "content":
                    full_content += chunk.content
                    yield {
                        "event": "content_delta",
                        "data": json.dumps({"content": chunk.content}),
                    }
                elif chunk.type == "reasoning":
                    reasoning_parts.append(chunk.reasoning)
                    yield {
                        "event": "reasoning_delta",
                        "data": json.dumps({"content": chunk.reasoning}),
                    }
                elif chunk.type == "tool_call":
                    tc = chunk.tool_call
                    if tc:
                        tool_calls_collected.append(tc)
                elif chunk.type == "done":
                    break
                elif chunk.type == "error":
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": chunk.error}),
                    }
                    return

            # If no tool calls were made, we have the final response
            if not tool_calls_collected:
                break

            # Notify frontend about the tool round
            yield {
                "event": "tool_round",
                "data": json.dumps({"round": _round + 1, "max_rounds": MAX_TOOL_ROUNDS}),
            }

            # Execute each tool call and build the conversation continuation
            # Add assistant message with tool calls to the conversation
            tc_openai_format = []
            for tc in tool_calls_collected:
                tc_openai_format.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": tc.arguments},
                })

            # We need to add the assistant's tool-call message + tool results
            # to the messages list for the next LLM round
            messages.append(LLMMessage(role="assistant", content=""))

            for tc in tool_calls_collected:
                # Notify the frontend about the tool call
                yield {
                    "event": "tool_call",
                    "data": json.dumps({
                        "id": tc.id,
                        "name": tc.name,
                        "arguments": tc.arguments,
                        "status": "running",
                    }),
                }

                # Execute the tool
                result = _execute_tool(tc.name, tc.arguments, db)

                # Notify frontend with result
                yield {
                    "event": "tool_call",
                    "data": json.dumps({
                        "id": tc.id,
                        "name": tc.name,
                        "arguments": tc.arguments,
                        "result": result,
                        "status": "completed",
                    }),
                }

                # Append the tool result as a content message for the next round
                # (simplified: we put the tool result as a user-style message since
                # not all providers support the tool role natively)
                messages.append(LLMMessage(
                    role="user",
                    content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
                ))

            # Clear content for the next LLM round (the final text reply)
            full_content = ""

        # Emit the final message
        latency_ms = int((time.time() - start_time) * 1000)
        metadata = {
            "model": provider_record.model_id,
            "provider": provider_record.provider_type,
            "latency_ms": latency_ms,
        }

        reasoning_json = json.dumps([{"type": "thinking", "content": "".join(reasoning_parts)}]) if reasoning_parts else None

        assistant_msg = Message(
            session_id=session_id,
            role="assistant",
            content=full_content,
            agent_id=agent_id,
            reasoning_json=reasoning_json,
            metadata_json=json.dumps(metadata),
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        msg_response = {
            "id": str(assistant_msg.id),
            "session_id": str(session_id),
            "role": "assistant",
            "content": full_content,
            "agent_id": str(agent_id),
            "reasoning": json.loads(reasoning_json) if reasoning_json else None,
            "metadata": metadata,
            "created_at": assistant_msg.created_at.isoformat() if assistant_msg.created_at else None,
        }
        yield {
            "event": "message_complete",
            "data": json.dumps(msg_response),
        }
        yield {"event": "done", "data": "{}"}

    except Exception as e:
        if full_content:
            latency_ms = int((time.time() - start_time) * 1000)
            assistant_msg = Message(
                session_id=session_id,
                role="assistant",
                content=full_content,
                agent_id=agent_id,
                metadata_json=json.dumps({"model": provider_record.model_id, "error": str(e), "latency_ms": latency_ms}),
            )
            db.add(assistant_msg)
            db.commit()

        yield {
            "event": "error",
            "data": json.dumps({"error": str(e)}),
        }


async def _stream_response_with_mcp(llm, messages, system_prompt, db, session_id, agent_id, provider_record, start_time, native_tools, mcp_server_configs):
    """Like _stream_response but connects to MCP servers for tool discovery and execution."""
    full_content = ""
    reasoning_parts = []

    async with AsyncExitStack() as stack:
        mcp_connections, all_mcp_tools = await _connect_mcp_servers(stack, mcp_server_configs)
        tools = _merge_tools(native_tools, all_mcp_tools)

        try:
            for _round in range(MAX_TOOL_ROUNDS + 1):
                tool_calls_collected = []

                async for chunk in llm.chat_stream(messages, system_prompt=system_prompt, tools=tools):
                    if chunk.type == "content":
                        full_content += chunk.content
                        yield {"event": "content_delta", "data": json.dumps({"content": chunk.content})}
                    elif chunk.type == "reasoning":
                        reasoning_parts.append(chunk.reasoning)
                        yield {"event": "reasoning_delta", "data": json.dumps({"content": chunk.reasoning})}
                    elif chunk.type == "tool_call":
                        tc = chunk.tool_call
                        if tc:
                            tool_calls_collected.append(tc)
                    elif chunk.type == "done":
                        break
                    elif chunk.type == "error":
                        yield {"event": "error", "data": json.dumps({"error": chunk.error})}
                        return

                if not tool_calls_collected:
                    break

                # Notify frontend about the tool round
                yield {"event": "tool_round", "data": json.dumps({"round": _round + 1, "max_rounds": MAX_TOOL_ROUNDS})}

                messages.append(LLMMessage(role="assistant", content=""))

                for tc in tool_calls_collected:
                    yield {"event": "tool_call", "data": json.dumps({"id": tc.id, "name": tc.name, "arguments": tc.arguments, "status": "running"})}

                    result = await _execute_mcp_or_native_tool(tc.name, tc.arguments, mcp_connections, db)

                    yield {"event": "tool_call", "data": json.dumps({"id": tc.id, "name": tc.name, "arguments": tc.arguments, "result": result, "status": "completed"})}

                    messages.append(LLMMessage(
                        role="user",
                        content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
                    ))

                full_content = ""

            latency_ms = int((time.time() - start_time) * 1000)
            metadata = {"model": provider_record.model_id, "provider": provider_record.provider_type, "latency_ms": latency_ms}
            reasoning_json = json.dumps([{"type": "thinking", "content": "".join(reasoning_parts)}]) if reasoning_parts else None

            assistant_msg = Message(
                session_id=session_id, role="assistant", content=full_content,
                agent_id=agent_id, reasoning_json=reasoning_json, metadata_json=json.dumps(metadata),
            )
            db.add(assistant_msg)
            db.commit()
            db.refresh(assistant_msg)

            msg_response = {
                "id": str(assistant_msg.id), "session_id": str(session_id), "role": "assistant",
                "content": full_content, "agent_id": str(agent_id),
                "reasoning": json.loads(reasoning_json) if reasoning_json else None,
                "metadata": metadata, "created_at": assistant_msg.created_at.isoformat() if assistant_msg.created_at else None,
            }
            yield {"event": "message_complete", "data": json.dumps(msg_response)}
            yield {"event": "done", "data": "{}"}

        except Exception as e:
            if full_content:
                latency_ms = int((time.time() - start_time) * 1000)
                assistant_msg = Message(
                    session_id=session_id, role="assistant", content=full_content, agent_id=agent_id,
                    metadata_json=json.dumps({"model": provider_record.model_id, "error": str(e), "latency_ms": latency_ms}),
                )
                db.add(assistant_msg)
                db.commit()
            yield {"event": "error", "data": json.dumps({"error": str(e)})}


# ---------------------------------------------------------------------------
# Team chat mode handlers (SQLite)
# ---------------------------------------------------------------------------

def _create_llm_for_provider(provider_record):
    """Create an LLM provider instance from a provider DB record."""
    api_key = decrypt_api_key(provider_record.api_key) if provider_record.api_key else None
    config = json.loads(provider_record.config_json) if provider_record.config_json else None
    return create_provider_from_config(
        provider_type=provider_record.provider_type,
        api_key=api_key,
        base_url=provider_record.base_url,
        model_id=provider_record.model_id,
        config=config,
    )


async def _chat_with_tools(llm, messages: list, system_prompt: str | None, tools: list | None, db) -> str:
    """Non-streaming chat that executes tool calls in a loop until a final text response.

    Used by team modes (route/collaborate) where agents need to use tools
    but their responses aren't streamed to the frontend.
    """
    chat_messages = list(messages)
    for _round in range(MAX_TOOL_ROUNDS):
        response = await llm.chat(chat_messages, system_prompt=system_prompt, tools=tools)
        if not response.tool_calls:
            return response.content or ""
        # Execute each tool call and feed results back
        chat_messages.append(LLMMessage(role="assistant", content=response.content or ""))
        for tc in response.tool_calls:
            result = _execute_tool(tc.name, tc.arguments, db)
            chat_messages.append(LLMMessage(
                role="user",
                content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
            ))
    # Final call without tools to force a text response
    final = await llm.chat(chat_messages, system_prompt=system_prompt)
    return final.content or ""


async def _chat_with_tools_mongo(llm, messages: list, system_prompt: str | None, tools: list | None, mongo_db) -> str:
    """Non-streaming chat with tool execution loop (MongoDB version)."""
    chat_messages = list(messages)
    for _round in range(MAX_TOOL_ROUNDS):
        response = await llm.chat(chat_messages, system_prompt=system_prompt, tools=tools)
        if not response.tool_calls:
            return response.content or ""
        chat_messages.append(LLMMessage(role="assistant", content=response.content or ""))
        for tc in response.tool_calls:
            result = await _execute_tool_mongo(tc.name, tc.arguments, mongo_db)
            chat_messages.append(LLMMessage(
                role="user",
                content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
            ))
    final = await llm.chat(chat_messages, system_prompt=system_prompt)
    return final.content or ""


async def _chat_with_tools_and_mcp(llm, messages: list, system_prompt: str | None, tools: list | None, db, mcp_server_configs: list[dict]) -> str:
    """Non-streaming chat with MCP + native tool execution loop (SQLite)."""
    async with AsyncExitStack() as stack:
        mcp_connections, all_mcp_tools = await _connect_mcp_servers(stack, mcp_server_configs)
        merged_tools = _merge_tools(tools, all_mcp_tools)

        chat_messages = list(messages)
        for _round in range(MAX_TOOL_ROUNDS):
            response = await llm.chat(chat_messages, system_prompt=system_prompt, tools=merged_tools)
            if not response.tool_calls:
                return response.content or ""
            chat_messages.append(LLMMessage(role="assistant", content=response.content or ""))
            for tc in response.tool_calls:
                result = await _execute_mcp_or_native_tool(tc.name, tc.arguments, mcp_connections, db)
                chat_messages.append(LLMMessage(
                    role="user",
                    content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
                ))
        final = await llm.chat(chat_messages, system_prompt=system_prompt)
        return final.content or ""


async def _chat_with_tools_and_mcp_mongo(llm, messages: list, system_prompt: str | None, tools: list | None, mongo_db, mcp_server_configs: list[dict]) -> str:
    """Non-streaming chat with MCP + native tool execution loop (MongoDB)."""
    async with AsyncExitStack() as stack:
        mcp_connections, all_mcp_tools = await _connect_mcp_servers(stack, mcp_server_configs)
        merged_tools = _merge_tools(tools, all_mcp_tools)

        chat_messages = list(messages)
        for _round in range(MAX_TOOL_ROUNDS):
            response = await llm.chat(chat_messages, system_prompt=system_prompt, tools=merged_tools)
            if not response.tool_calls:
                return response.content or ""
            chat_messages.append(LLMMessage(role="assistant", content=response.content or ""))
            for tc in response.tool_calls:
                result = await _execute_mcp_or_native_tool_mongo(tc.name, tc.arguments, mcp_connections, mongo_db)
                chat_messages.append(LLMMessage(
                    role="user",
                    content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
                ))
        final = await llm.chat(chat_messages, system_prompt=system_prompt)
        return final.content or ""


async def _team_chat_coordinate(agents_with_providers, messages, db, session_id, start_time, user_message):
    """Coordinate mode: a router LLM picks the best agent, then that agent responds."""
    try:
        # Use the first agent's provider as the router LLM
        router_agent, router_provider = agents_with_providers[0]
        router_llm = _create_llm_for_provider(router_provider)

        # Build the agent selection prompt
        agent_descriptions = []
        for ag, pr in agents_with_providers:
            desc = ag.description or "No description"
            agent_descriptions.append(f"- **{ag.name}** (id={ag.id}): {desc}")
        agents_list = "\n".join(agent_descriptions)

        router_prompt = (
            "You are a routing assistant. Your job is to select the single best agent to handle the user's query.\n\n"
            f"Available agents:\n{agents_list}\n\n"
            "Reply with ONLY the agent name (exactly as shown) that should handle this query. Nothing else."
        )

        # Emit routing step
        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": str(router_agent.id), "agent_name": "Router", "step": "routing"}),
        }

        # Ask the router to pick an agent
        router_messages = [LLMMessage(role="user", content=user_message)]
        router_response = await router_llm.chat(router_messages, system_prompt=router_prompt)

        # Find the selected agent by matching name
        selected = None
        router_answer = (router_response.content or "").strip()
        for ag, pr in agents_with_providers:
            if ag.name.lower() in router_answer.lower() or router_answer.lower() in ag.name.lower():
                selected = (ag, pr)
                break

        # Fallback to first agent if routing failed
        if not selected:
            selected = agents_with_providers[0]

        sel_agent, sel_provider = selected

        # Emit selected agent step
        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": str(sel_agent.id), "agent_name": sel_agent.name, "step": "responding"}),
        }

        # Stream the selected agent's response using _stream_response
        sel_llm = _create_llm_for_provider(sel_provider)
        tools = _build_tools_for_llm(sel_agent, db)
        mcp_configs = _load_mcp_server_configs(sel_agent, db)

        if mcp_configs:
            async for event in _stream_response_with_mcp(
                sel_llm, messages, sel_agent.system_prompt, db, session_id,
                sel_agent.id, sel_provider, start_time, tools, mcp_configs
            ):
                yield event
        else:
            async for event in _stream_response(
                sel_llm, messages, sel_agent.system_prompt, db, session_id,
                sel_agent.id, sel_provider, start_time, tools
            ):
                yield event

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _team_chat_route(agents_with_providers, messages, db, session_id, start_time, user_message):
    """Route mode: all agents respond in parallel, then a synthesizer merges the best answer."""
    try:
        # Emit routing step
        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": "", "agent_name": "Router", "step": "routing"}),
        }

        # Collect responses from all agents in parallel (with tool execution)
        async def get_agent_response(agent, provider):
            llm = _create_llm_for_provider(provider)
            tools = _build_tools_for_llm(agent, db)
            mcp_configs = _load_mcp_server_configs(agent, db)
            if mcp_configs:
                content = await _chat_with_tools_and_mcp(llm, messages, agent.system_prompt, tools, db, mcp_configs)
            else:
                content = await _chat_with_tools(llm, messages, agent.system_prompt, tools, db)
            return agent, provider, content

        tasks = [get_agent_response(ag, pr) for ag, pr in agents_with_providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect successful responses
        agent_responses = []
        for result in results:
            if isinstance(result, Exception):
                continue
            ag, pr, content = result
            agent_responses.append({
                "agent_name": ag.name,
                "agent_id": ag.id,
                "response": content,
            })
            # Emit step for each completed agent
            yield {
                "event": "agent_step",
                "data": json.dumps({"agent_id": str(ag.id), "agent_name": ag.name, "step": "completed"}),
            }

        if not agent_responses:
            yield {"event": "error", "data": json.dumps({"error": "All agents failed to respond"})}
            return

        # Use the first available provider as the synthesizer
        synth_agent, synth_provider = agents_with_providers[0]
        synth_llm = _create_llm_for_provider(synth_provider)

        # Build synthesis prompt
        responses_text = "\n\n".join(
            f"**{r['agent_name']}:**\n{r['response']}" for r in agent_responses
        )
        synth_prompt = (
            "You are a synthesis assistant. Multiple agents have responded to a user query. "
            "Review all responses and produce the single best, comprehensive answer. "
            "You may combine insights from multiple agents or choose the best response.\n\n"
            "Do NOT mention that multiple agents responded. Just provide the best answer directly."
        )
        synth_messages = [
            LLMMessage(role="user", content=user_message),
            LLMMessage(role="user", content=f"Here are the responses from different specialists:\n\n{responses_text}"),
        ]

        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": "", "agent_name": "Synthesizer", "step": "synthesizing"}),
        }

        # Stream the synthesized response
        full_content = ""
        async for chunk in synth_llm.chat_stream(synth_messages, system_prompt=synth_prompt):
            if chunk.type == "content":
                full_content += chunk.content
                yield {"event": "content_delta", "data": json.dumps({"content": chunk.content})}
            elif chunk.type == "error":
                yield {"event": "error", "data": json.dumps({"error": chunk.error})}
                return
            elif chunk.type == "done":
                break

        # Save the final message
        latency_ms = int((time.time() - start_time) * 1000)
        contributing_agents = [{"id": str(r["agent_id"]), "name": r["agent_name"]} for r in agent_responses]
        metadata = {
            "model": synth_provider.model_id,
            "provider": synth_provider.provider_type,
            "latency_ms": latency_ms,
            "team_mode": "route",
            "contributing_agents": contributing_agents,
        }

        assistant_msg = Message(
            session_id=session_id,
            role="assistant",
            content=full_content,
            agent_id=synth_agent.id,
            metadata_json=json.dumps(metadata),
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        msg_response = {
            "id": str(assistant_msg.id),
            "session_id": str(session_id),
            "role": "assistant",
            "content": full_content,
            "agent_id": str(synth_agent.id),
            "metadata": metadata,
            "created_at": assistant_msg.created_at.isoformat() if assistant_msg.created_at else None,
        }
        yield {"event": "message_complete", "data": json.dumps(msg_response)}
        yield {"event": "done", "data": "{}"}

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _team_chat_collaborate(agents_with_providers, messages, db, session_id, start_time, user_message):
    """Collaborate mode: agents run sequentially, each building on previous agents' outputs."""
    try:
        accumulated_context = []
        last_agent = None
        last_provider = None
        final_content = ""

        for i, (ag, pr) in enumerate(agents_with_providers):
            is_last = (i == len(agents_with_providers) - 1)
            last_agent = ag
            last_provider = pr

            # Emit step for this agent
            yield {
                "event": "agent_step",
                "data": json.dumps({"agent_id": str(ag.id), "agent_name": ag.name, "step": "responding"}),
            }

            llm = _create_llm_for_provider(pr)
            tools = _build_tools_for_llm(ag, db)
            mcp_configs = _load_mcp_server_configs(ag, db)

            # Build messages for this agent: original history + accumulated context from previous agents
            agent_messages = list(messages)  # copy original history
            if accumulated_context:
                context_text = "\n\n".join(
                    f"[{c['agent_name']} said]: {c['response']}" for c in accumulated_context
                )
                agent_messages.append(LLMMessage(
                    role="user",
                    content=f"Previous team members have provided these inputs:\n\n{context_text}\n\nPlease build on their work to provide your contribution.",
                ))

            if is_last:
                # Stream the final agent's response (with MCP if configured)
                if mcp_configs:
                    async for event in _stream_response_with_mcp(
                        llm, agent_messages, ag.system_prompt, db, session_id,
                        ag.id, pr, start_time, tools, mcp_configs
                    ):
                        yield event
                else:
                    async for event in _stream_response(
                        llm, agent_messages, ag.system_prompt, db, session_id,
                        ag.id, pr, start_time, tools
                    ):
                        yield event
            else:
                # Non-final agents: get response with tool execution (not streamed)
                if mcp_configs:
                    content = await _chat_with_tools_and_mcp(llm, agent_messages, ag.system_prompt, tools, db, mcp_configs)
                else:
                    content = await _chat_with_tools(llm, agent_messages, ag.system_prompt, tools, db)
                accumulated_context.append({
                    "agent_name": ag.name,
                    "response": content,
                })

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _build_tools_for_llm_mongo(agent, mongo_db) -> list[dict] | None:
    """Retrieve agent's tool definitions from MongoDB and format them for the LLM."""
    tools_raw = agent.get("tools_json") or agent.get("tools")
    if not tools_raw:
        return None
    if isinstance(tools_raw, str):
        try:
            tool_ids = json.loads(tools_raw)
        except (json.JSONDecodeError, TypeError):
            return None
    elif isinstance(tools_raw, list):
        tool_ids = tools_raw
    else:
        return None
    if not tool_ids:
        return None

    tools = []
    for tid in tool_ids:
        td = await ToolDefinitionCollection.find_by_id(mongo_db, str(tid))
        if not td or not td.get("is_active", True):
            continue
        params = td.get("parameters_json") or td.get("parameters")
        if isinstance(params, str):
            try:
                parameters = json.loads(params)
            except json.JSONDecodeError:
                parameters = {"type": "object", "properties": {}}
        elif isinstance(params, dict):
            parameters = params
        else:
            parameters = {"type": "object", "properties": {}}
        tools.append({
            "type": "function",
            "function": {
                "name": td.get("name", ""),
                "description": td.get("description", ""),
                "parameters": parameters,
            },
        })
    return tools if tools else None


def _create_llm_for_mongo_provider(provider_record):
    """Create an LLM provider instance from a MongoDB provider document."""
    api_key = decrypt_api_key(provider_record["api_key"]) if provider_record.get("api_key") else None
    config_str = provider_record.get("config_json")
    config = json.loads(config_str) if isinstance(config_str, str) and config_str else config_str
    return create_provider_from_config(
        provider_type=provider_record["provider_type"],
        api_key=api_key,
        base_url=provider_record.get("base_url"),
        model_id=provider_record["model_id"],
        config=config,
    )


async def _chat_mongo(request: ChatRequest, current_user: TokenData, start_time: float):
    mongo_db = get_database()

    session = await SessionCollection.find_by_id(mongo_db, request.session_id)
    if not session or session.get("user_id") != current_user.user_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build message history
    past_messages = await MessageCollection.find_by_session(mongo_db, request.session_id)
    messages = []
    for msg in past_messages:
        if msg["role"] in ("user", "assistant"):
            messages.append(LLMMessage(role=msg["role"], content=msg.get("content", "")))

    # Process attachments if present
    image_parts = []
    attachments_json = None
    if request.attachments:
        image_parts, attachment_records = await _process_attachments_mongo(
            request.attachments, request.session_id, current_user.user_id, mongo_db,
        )
        if attachment_records:
            attachments_json = json.dumps(attachment_records)

    await MessageCollection.create(mongo_db, {
        "session_id": request.session_id,
        "role": "user",
        "content": request.message,
        "attachments_json": attachments_json,
    })

    # Add user message to history (with images + RAG context)
    messages.append(_build_user_llm_message(request.message, request.session_id, image_parts))

    # --- Team chat (MongoDB) ---
    if session["entity_type"] == "team":
        team = await TeamCollection.find_by_id(mongo_db, str(session["entity_id"]))
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        agent_ids_raw = team.get("agent_ids_json") or team.get("agent_ids", [])
        if isinstance(agent_ids_raw, str):
            agent_ids = json.loads(agent_ids_raw)
        else:
            agent_ids = agent_ids_raw

        agents_with_providers = []
        for aid in agent_ids:
            ag = await AgentCollection.find_by_id(mongo_db, str(aid))
            if not ag:
                continue
            pid = ag.get("provider_id")
            if not pid:
                continue
            pr = await LLMProviderCollection.find_by_id(mongo_db, str(pid))
            if not pr:
                continue
            agents_with_providers.append((ag, pr))

        if not agents_with_providers:
            raise HTTPException(status_code=400, detail="No agents in team have a configured provider")

        mode = team.get("mode", "coordinate")

        if mode == "coordinate":
            return EventSourceResponse(
                _team_chat_coordinate_mongo(agents_with_providers, messages, mongo_db, request.session_id, start_time, request.message)
            )
        elif mode == "route":
            return EventSourceResponse(
                _team_chat_route_mongo(agents_with_providers, messages, mongo_db, request.session_id, start_time, request.message)
            )
        elif mode == "collaborate":
            return EventSourceResponse(
                _team_chat_collaborate_mongo(agents_with_providers, messages, mongo_db, request.session_id, start_time, request.message)
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown team mode: {mode}")

    # --- Agent chat (MongoDB) ---
    agent = await AgentCollection.find_by_id(mongo_db, str(session["entity_id"]))
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    provider_id = agent.get("provider_id")
    if not provider_id:
        raise HTTPException(status_code=400, detail="Agent has no provider configured")

    provider_record = await LLMProviderCollection.find_by_id(mongo_db, str(provider_id))
    if not provider_record:
        raise HTTPException(status_code=404, detail="Provider not found")

    llm = _create_llm_for_mongo_provider(provider_record)
    system_prompt = agent.get("system_prompt")
    tools = await _build_tools_for_llm_mongo(agent, mongo_db)
    mcp_server_configs = await _load_mcp_server_configs_mongo(agent, mongo_db)

    if request.stream:
        if mcp_server_configs:
            return EventSourceResponse(
                _stream_response_with_mcp_mongo(llm, messages, system_prompt, mongo_db, request.session_id, str(agent["_id"]), provider_record, start_time, tools, mcp_server_configs),
            )
        return EventSourceResponse(
            _stream_response_mongo(llm, messages, system_prompt, mongo_db, request.session_id, str(agent["_id"]), provider_record, start_time, tools),
        )
    else:
        response = await llm.chat(messages, system_prompt=system_prompt, tools=tools)
        latency_ms = int((time.time() - start_time) * 1000)
        metadata = {"model": provider_record["model_id"], "provider": provider_record["provider_type"], "latency_ms": latency_ms}
        msg = await MessageCollection.create(mongo_db, {
            "session_id": request.session_id,
            "role": "assistant",
            "content": response.content,
            "agent_id": str(agent["_id"]),
            "metadata_json": json.dumps(metadata),
        })
        return {
            "id": str(msg["_id"]),
            "session_id": request.session_id,
            "role": "assistant",
            "content": response.content,
            "metadata": metadata,
            "created_at": msg["created_at"].isoformat() if msg.get("created_at") else None,
        }


async def _stream_response_mongo(llm, messages, system_prompt, mongo_db, session_id, agent_id, provider_record, start_time, tools=None):
    full_content = ""
    reasoning_parts = []

    try:
        async for chunk in llm.chat_stream(messages, system_prompt=system_prompt, tools=tools):
            if chunk.type == "content":
                full_content += chunk.content
                yield {"event": "content_delta", "data": json.dumps({"content": chunk.content})}
            elif chunk.type == "reasoning":
                reasoning_parts.append(chunk.reasoning)
                yield {"event": "reasoning_delta", "data": json.dumps({"content": chunk.reasoning})}
            elif chunk.type == "tool_call":
                tc = chunk.tool_call
                yield {"event": "tool_call", "data": json.dumps({"id": tc.id if tc else "", "name": tc.name if tc else "", "arguments": tc.arguments if tc else "", "status": "completed"})}
            elif chunk.type == "done":
                latency_ms = int((time.time() - start_time) * 1000)
                metadata = {"model": provider_record["model_id"], "provider": provider_record["provider_type"], "latency_ms": latency_ms}
                if chunk.usage:
                    metadata["tokens_used"] = chunk.usage

                reasoning_json = json.dumps([{"type": "thinking", "content": "".join(reasoning_parts)}]) if reasoning_parts else None

                msg = await MessageCollection.create(mongo_db, {
                    "session_id": session_id, "role": "assistant", "content": full_content,
                    "agent_id": agent_id, "reasoning_json": reasoning_json, "metadata_json": json.dumps(metadata),
                })

                msg_response = {
                    "id": str(msg["_id"]), "session_id": session_id, "role": "assistant",
                    "content": full_content, "agent_id": agent_id,
                    "reasoning": json.loads(reasoning_json) if reasoning_json else None,
                    "metadata": metadata, "created_at": msg["created_at"].isoformat() if msg.get("created_at") else None,
                }
                yield {"event": "message_complete", "data": json.dumps(msg_response)}
                yield {"event": "done", "data": "{}"}
                return

            elif chunk.type == "error":
                yield {"event": "error", "data": json.dumps({"error": chunk.error})}
                return

    except Exception as e:
        if full_content:
            await MessageCollection.create(mongo_db, {
                "session_id": session_id, "role": "assistant", "content": full_content,
                "agent_id": agent_id, "metadata_json": json.dumps({"error": str(e)}),
            })
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _stream_response_with_mcp_mongo(llm, messages, system_prompt, mongo_db, session_id, agent_id, provider_record, start_time, native_tools, mcp_server_configs):
    """Like _stream_response_mongo but connects to MCP servers for tool discovery and execution."""
    full_content = ""
    reasoning_parts = []

    async with AsyncExitStack() as stack:
        mcp_connections, all_mcp_tools = await _connect_mcp_servers(stack, mcp_server_configs)
        tools = _merge_tools(native_tools, all_mcp_tools)

        try:
            for _round in range(MAX_TOOL_ROUNDS + 1):
                tool_calls_collected = []

                async for chunk in llm.chat_stream(messages, system_prompt=system_prompt, tools=tools):
                    if chunk.type == "content":
                        full_content += chunk.content
                        yield {"event": "content_delta", "data": json.dumps({"content": chunk.content})}
                    elif chunk.type == "reasoning":
                        reasoning_parts.append(chunk.reasoning)
                        yield {"event": "reasoning_delta", "data": json.dumps({"content": chunk.reasoning})}
                    elif chunk.type == "tool_call":
                        tc = chunk.tool_call
                        if tc:
                            tool_calls_collected.append(tc)
                    elif chunk.type == "done":
                        break
                    elif chunk.type == "error":
                        yield {"event": "error", "data": json.dumps({"error": chunk.error})}
                        return

                if not tool_calls_collected:
                    break

                # Notify frontend about the tool round
                yield {"event": "tool_round", "data": json.dumps({"round": _round + 1, "max_rounds": MAX_TOOL_ROUNDS})}

                messages.append(LLMMessage(role="assistant", content=""))

                for tc in tool_calls_collected:
                    yield {"event": "tool_call", "data": json.dumps({"id": tc.id, "name": tc.name, "arguments": tc.arguments, "status": "running"})}

                    result = await _execute_mcp_or_native_tool_mongo(tc.name, tc.arguments, mcp_connections, mongo_db)

                    yield {"event": "tool_call", "data": json.dumps({"id": tc.id, "name": tc.name, "arguments": tc.arguments, "result": result, "status": "completed"})}

                    messages.append(LLMMessage(
                        role="user",
                        content=f"[Tool '{tc.name}' returned: {result}]\n\n{TOOL_RESULT_PROMPT}",
                    ))

                full_content = ""

            latency_ms = int((time.time() - start_time) * 1000)
            metadata = {"model": provider_record["model_id"], "provider": provider_record["provider_type"], "latency_ms": latency_ms}
            reasoning_json = json.dumps([{"type": "thinking", "content": "".join(reasoning_parts)}]) if reasoning_parts else None

            msg = await MessageCollection.create(mongo_db, {
                "session_id": session_id, "role": "assistant", "content": full_content,
                "agent_id": agent_id, "reasoning_json": reasoning_json, "metadata_json": json.dumps(metadata),
            })

            msg_response = {
                "id": str(msg["_id"]), "session_id": session_id, "role": "assistant",
                "content": full_content, "agent_id": agent_id,
                "reasoning": json.loads(reasoning_json) if reasoning_json else None,
                "metadata": metadata, "created_at": msg["created_at"].isoformat() if msg.get("created_at") else None,
            }
            yield {"event": "message_complete", "data": json.dumps(msg_response)}
            yield {"event": "done", "data": "{}"}

        except Exception as e:
            if full_content:
                await MessageCollection.create(mongo_db, {
                    "session_id": session_id, "role": "assistant", "content": full_content,
                    "agent_id": agent_id, "metadata_json": json.dumps({"error": str(e)}),
                })
            yield {"event": "error", "data": json.dumps({"error": str(e)})}


# ---------------------------------------------------------------------------
# Team chat mode handlers (MongoDB)
# ---------------------------------------------------------------------------

async def _team_chat_coordinate_mongo(agents_with_providers, messages, mongo_db, session_id, start_time, user_message):
    """Coordinate mode (MongoDB): router picks the best agent, that agent responds."""
    try:
        router_agent, router_provider = agents_with_providers[0]
        router_llm = _create_llm_for_mongo_provider(router_provider)

        agent_descriptions = []
        for ag, pr in agents_with_providers:
            desc = ag.get("description") or "No description"
            name = ag.get("name", "Unknown")
            agent_descriptions.append(f"- **{name}** (id={ag['_id']}): {desc}")
        agents_list = "\n".join(agent_descriptions)

        router_prompt = (
            "You are a routing assistant. Your job is to select the single best agent to handle the user's query.\n\n"
            f"Available agents:\n{agents_list}\n\n"
            "Reply with ONLY the agent name (exactly as shown) that should handle this query. Nothing else."
        )

        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": str(router_agent["_id"]), "agent_name": "Router", "step": "routing"}),
        }

        router_messages = [LLMMessage(role="user", content=user_message)]
        router_response = await router_llm.chat(router_messages, system_prompt=router_prompt)

        selected = None
        router_answer = (router_response.content or "").strip()
        for ag, pr in agents_with_providers:
            name = ag.get("name", "")
            if name.lower() in router_answer.lower() or router_answer.lower() in name.lower():
                selected = (ag, pr)
                break

        if not selected:
            selected = agents_with_providers[0]

        sel_agent, sel_provider = selected
        sel_name = sel_agent.get("name", "Agent")

        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": str(sel_agent["_id"]), "agent_name": sel_name, "step": "responding"}),
        }

        sel_llm = _create_llm_for_mongo_provider(sel_provider)
        tools = await _build_tools_for_llm_mongo(sel_agent, mongo_db)
        mcp_configs = await _load_mcp_server_configs_mongo(sel_agent, mongo_db)

        if mcp_configs:
            async for event in _stream_response_with_mcp_mongo(
                sel_llm, messages, sel_agent.get("system_prompt"), mongo_db, session_id,
                str(sel_agent["_id"]), sel_provider, start_time, tools, mcp_configs
            ):
                yield event
        else:
            async for event in _stream_response_mongo(
                sel_llm, messages, sel_agent.get("system_prompt"), mongo_db, session_id,
                str(sel_agent["_id"]), sel_provider, start_time, tools
            ):
                yield event

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _team_chat_route_mongo(agents_with_providers, messages, mongo_db, session_id, start_time, user_message):
    """Route mode (MongoDB): all agents respond in parallel, synthesizer merges."""
    try:
        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": "", "agent_name": "Router", "step": "routing"}),
        }

        async def get_agent_response(agent, provider):
            llm = _create_llm_for_mongo_provider(provider)
            tools = await _build_tools_for_llm_mongo(agent, mongo_db)
            mcp_configs = await _load_mcp_server_configs_mongo(agent, mongo_db)
            if mcp_configs:
                content = await _chat_with_tools_and_mcp_mongo(llm, messages, agent.get("system_prompt"), tools, mongo_db, mcp_configs)
            else:
                content = await _chat_with_tools_mongo(llm, messages, agent.get("system_prompt"), tools, mongo_db)
            return agent, provider, content

        tasks = [get_agent_response(ag, pr) for ag, pr in agents_with_providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        agent_responses = []
        for result in results:
            if isinstance(result, Exception):
                continue
            ag, pr, content = result
            name = ag.get("name", "Agent")
            agent_responses.append({
                "agent_name": name,
                "agent_id": str(ag["_id"]),
                "response": content,
            })
            yield {
                "event": "agent_step",
                "data": json.dumps({"agent_id": str(ag["_id"]), "agent_name": name, "step": "completed"}),
            }

        if not agent_responses:
            yield {"event": "error", "data": json.dumps({"error": "All agents failed to respond"})}
            return

        synth_agent, synth_provider = agents_with_providers[0]
        synth_llm = _create_llm_for_mongo_provider(synth_provider)

        responses_text = "\n\n".join(
            f"**{r['agent_name']}:**\n{r['response']}" for r in agent_responses
        )
        synth_prompt = (
            "You are a synthesis assistant. Multiple agents have responded to a user query. "
            "Review all responses and produce the single best, comprehensive answer. "
            "You may combine insights from multiple agents or choose the best response.\n\n"
            "Do NOT mention that multiple agents responded. Just provide the best answer directly."
        )
        synth_messages = [
            LLMMessage(role="user", content=user_message),
            LLMMessage(role="user", content=f"Here are the responses from different specialists:\n\n{responses_text}"),
        ]

        yield {
            "event": "agent_step",
            "data": json.dumps({"agent_id": "", "agent_name": "Synthesizer", "step": "synthesizing"}),
        }

        full_content = ""
        async for chunk in synth_llm.chat_stream(synth_messages, system_prompt=synth_prompt):
            if chunk.type == "content":
                full_content += chunk.content
                yield {"event": "content_delta", "data": json.dumps({"content": chunk.content})}
            elif chunk.type == "error":
                yield {"event": "error", "data": json.dumps({"error": chunk.error})}
                return
            elif chunk.type == "done":
                break

        latency_ms = int((time.time() - start_time) * 1000)
        contributing_agents = [{"id": r["agent_id"], "name": r["agent_name"]} for r in agent_responses]
        metadata = {
            "model": synth_provider["model_id"],
            "provider": synth_provider["provider_type"],
            "latency_ms": latency_ms,
            "team_mode": "route",
            "contributing_agents": contributing_agents,
        }

        msg = await MessageCollection.create(mongo_db, {
            "session_id": session_id,
            "role": "assistant",
            "content": full_content,
            "agent_id": str(synth_agent["_id"]),
            "metadata_json": json.dumps(metadata),
        })

        msg_response = {
            "id": str(msg["_id"]),
            "session_id": session_id,
            "role": "assistant",
            "content": full_content,
            "agent_id": str(synth_agent["_id"]),
            "metadata": metadata,
            "created_at": msg["created_at"].isoformat() if msg.get("created_at") else None,
        }
        yield {"event": "message_complete", "data": json.dumps(msg_response)}
        yield {"event": "done", "data": "{}"}

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}


async def _team_chat_collaborate_mongo(agents_with_providers, messages, mongo_db, session_id, start_time, user_message):
    """Collaborate mode (MongoDB): agents run sequentially, each building on previous outputs."""
    try:
        accumulated_context = []

        for i, (ag, pr) in enumerate(agents_with_providers):
            is_last = (i == len(agents_with_providers) - 1)
            name = ag.get("name", "Agent")

            yield {
                "event": "agent_step",
                "data": json.dumps({"agent_id": str(ag["_id"]), "agent_name": name, "step": "responding"}),
            }

            llm = _create_llm_for_mongo_provider(pr)
            tools = await _build_tools_for_llm_mongo(ag, mongo_db)
            mcp_configs = await _load_mcp_server_configs_mongo(ag, mongo_db)

            agent_messages = list(messages)
            if accumulated_context:
                context_text = "\n\n".join(
                    f"[{c['agent_name']} said]: {c['response']}" for c in accumulated_context
                )
                agent_messages.append(LLMMessage(
                    role="user",
                    content=f"Previous team members have provided these inputs:\n\n{context_text}\n\nPlease build on their work to provide your contribution.",
                ))

            if is_last:
                if mcp_configs:
                    async for event in _stream_response_with_mcp_mongo(
                        llm, agent_messages, ag.get("system_prompt"), mongo_db, session_id,
                        str(ag["_id"]), pr, start_time, tools, mcp_configs
                    ):
                        yield event
                else:
                    async for event in _stream_response_mongo(
                        llm, agent_messages, ag.get("system_prompt"), mongo_db, session_id,
                        str(ag["_id"]), pr, start_time, tools
                    ):
                        yield event
            else:
                if mcp_configs:
                    content = await _chat_with_tools_and_mcp_mongo(llm, agent_messages, ag.get("system_prompt"), tools, mongo_db, mcp_configs)
                else:
                    content = await _chat_with_tools_mongo(llm, agent_messages, ag.get("system_prompt"), tools, mongo_db)
                accumulated_context.append({
                    "agent_name": name,
                    "response": content,
                })

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)})}
