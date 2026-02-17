import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import DATABASE_TYPE
from database import get_db
from models import Agent
from schemas import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse
from auth import get_current_user, TokenData, require_permission

if DATABASE_TYPE == "mongo":
    from database_mongo import get_database
    from models_mongo import AgentCollection

router = APIRouter(prefix="/agents", tags=["agents"])


def _agent_to_response(agent, is_mongo=False) -> AgentResponse:
    if is_mongo:
        tools_raw = agent.get("tools_json")
        if isinstance(tools_raw, str):
            tools_raw = json.loads(tools_raw)
        tools = [str(t) for t in tools_raw] if tools_raw else None
        mcp_raw = agent.get("mcp_servers_json")
        if isinstance(mcp_raw, str):
            mcp_raw = json.loads(mcp_raw)
        mcp_server_ids = [str(s) for s in mcp_raw] if mcp_raw else None
        config = agent.get("config_json")
        if isinstance(config, str):
            config = json.loads(config)
        return AgentResponse(
            id=str(agent["_id"]),
            name=agent["name"],
            description=agent.get("description"),
            system_prompt=agent.get("system_prompt"),
            provider_id=str(agent["provider_id"]) if agent.get("provider_id") else None,
            tools=tools,
            mcp_server_ids=mcp_server_ids,
            config=config,
            is_active=agent.get("is_active", True),
            created_at=agent["created_at"],
        )
    tools_raw = json.loads(agent.tools_json) if agent.tools_json else None
    tools = [str(t) for t in tools_raw] if tools_raw else None
    mcp_raw = json.loads(agent.mcp_servers_json) if agent.mcp_servers_json else None
    mcp_server_ids = [str(s) for s in mcp_raw] if mcp_raw else None
    config = json.loads(agent.config_json) if agent.config_json else None
    return AgentResponse(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt,
        provider_id=str(agent.provider_id) if agent.provider_id else None,
        tools=tools,
        mcp_server_ids=mcp_server_ids,
        config=config,
        is_active=agent.is_active,
        created_at=agent.created_at,
    )


@router.post("", response_model=AgentResponse)
async def create_agent(
    data: AgentCreate,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission("create_agents")),
    db: Session = Depends(get_db),
):
    tools_str = json.dumps(data.tools) if data.tools else None
    mcp_servers_str = json.dumps(data.mcp_server_ids) if data.mcp_server_ids else None
    config_str = json.dumps(data.config) if data.config else None

    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        doc = {
            "user_id": current_user.user_id,
            "name": data.name,
            "description": data.description,
            "system_prompt": data.system_prompt,
            "provider_id": data.provider_id,
            "tools_json": tools_str,
            "mcp_servers_json": mcp_servers_str,
            "config_json": config_str,
        }
        created = await AgentCollection.create(mongo_db, doc)
        return _agent_to_response(created, is_mongo=True)

    agent = Agent(
        user_id=int(current_user.user_id),
        name=data.name,
        description=data.description,
        system_prompt=data.system_prompt,
        provider_id=int(data.provider_id) if data.provider_id else None,
        tools_json=tools_str,
        mcp_servers_json=mcp_servers_str,
        config_json=config_str,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return _agent_to_response(agent)


@router.get("", response_model=AgentListResponse)
async def list_agents(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        agents = await AgentCollection.find_by_user(mongo_db, current_user.user_id)
        return AgentListResponse(agents=[_agent_to_response(a, is_mongo=True) for a in agents])

    agents = db.query(Agent).filter(
        Agent.user_id == int(current_user.user_id),
        Agent.is_active == True,
    ).all()
    return AgentListResponse(agents=[_agent_to_response(a) for a in agents])


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        agent = await AgentCollection.find_by_id(mongo_db, agent_id)
        if not agent or agent.get("user_id") != current_user.user_id:
            raise HTTPException(status_code=404, detail="Agent not found")
        return _agent_to_response(agent, is_mongo=True)

    agent = db.query(Agent).filter(
        Agent.id == int(agent_id),
        Agent.user_id == int(current_user.user_id),
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(agent)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    data: AgentUpdate,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = data.model_dump(exclude_unset=True)
    if "tools" in updates:
        updates["tools_json"] = json.dumps(updates.pop("tools")) if updates["tools"] else None
    if "mcp_server_ids" in updates:
        updates["mcp_servers_json"] = json.dumps(updates.pop("mcp_server_ids")) if updates["mcp_server_ids"] else None
    if "config" in updates:
        updates["config_json"] = json.dumps(updates.pop("config")) if updates["config"] else None

    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        updated = await AgentCollection.update(mongo_db, agent_id, current_user.user_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Agent not found")
        return _agent_to_response(updated, is_mongo=True)

    agent = db.query(Agent).filter(
        Agent.id == int(agent_id),
        Agent.user_id == int(current_user.user_id),
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    for key, value in updates.items():
        if key == "provider_id" and value:
            value = int(value)
        setattr(agent, key, value)
    db.commit()
    db.refresh(agent)
    return _agent_to_response(agent)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        success = await AgentCollection.delete(mongo_db, agent_id, current_user.user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Agent not found")
        return {"message": "Agent deleted"}

    agent = db.query(Agent).filter(
        Agent.id == int(agent_id),
        Agent.user_id == int(current_user.user_id),
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.is_active = False
    db.commit()
    return {"message": "Agent deleted"}
