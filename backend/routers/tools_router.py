import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import DATABASE_TYPE
from database import get_db
from models import ToolDefinition
from schemas import (
    ToolDefinitionCreate,
    ToolDefinitionUpdate,
    ToolDefinitionResponse,
    ToolDefinitionListResponse,
)
from auth import get_current_user, TokenData, require_permission

if DATABASE_TYPE == "mongo":
    from database_mongo import get_database
    from models_mongo import ToolDefinitionCollection

router = APIRouter(prefix="/tools", tags=["tools"])


def _tool_to_response(tool, is_mongo=False) -> ToolDefinitionResponse:
    if is_mongo:
        params = tool.get("parameters_json")
        if isinstance(params, str):
            params = json.loads(params)
        handler_config = tool.get("handler_config")
        if isinstance(handler_config, str):
            handler_config = json.loads(handler_config)
        return ToolDefinitionResponse(
            id=str(tool["_id"]),
            name=tool["name"],
            description=tool.get("description"),
            parameters=params or {},
            handler_type=tool.get("handler_type", "http"),
            handler_config=handler_config,
            is_active=tool.get("is_active", True),
            created_at=tool["created_at"],
        )
    params = json.loads(tool.parameters_json) if tool.parameters_json else {}
    handler_config = json.loads(tool.handler_config) if tool.handler_config else None
    return ToolDefinitionResponse(
        id=str(tool.id),
        name=tool.name,
        description=tool.description,
        parameters=params,
        handler_type=tool.handler_type,
        handler_config=handler_config,
        is_active=tool.is_active,
        created_at=tool.created_at,
    )


@router.post("", response_model=ToolDefinitionResponse)
async def create_tool(
    data: ToolDefinitionCreate,
    current_user: TokenData = Depends(get_current_user),
    _perm=Depends(require_permission("create_tools")),
    db: Session = Depends(get_db),
):
    params_str = json.dumps(data.parameters)
    handler_config_str = json.dumps(data.handler_config) if data.handler_config else None

    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        doc = {
            "user_id": current_user.user_id,
            "name": data.name,
            "description": data.description,
            "parameters_json": params_str,
            "handler_type": data.handler_type,
            "handler_config": handler_config_str,
        }
        created = await ToolDefinitionCollection.create(mongo_db, doc)
        return _tool_to_response(created, is_mongo=True)

    tool = ToolDefinition(
        user_id=int(current_user.user_id),
        name=data.name,
        description=data.description,
        parameters_json=params_str,
        handler_type=data.handler_type,
        handler_config=handler_config_str,
    )
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return _tool_to_response(tool)


@router.get("", response_model=ToolDefinitionListResponse)
async def list_tools(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        tools = await ToolDefinitionCollection.find_by_user(mongo_db, current_user.user_id)
        return ToolDefinitionListResponse(tools=[_tool_to_response(t, is_mongo=True) for t in tools])

    tools = db.query(ToolDefinition).filter(
        ToolDefinition.user_id == int(current_user.user_id),
        ToolDefinition.is_active == True,
    ).all()
    return ToolDefinitionListResponse(tools=[_tool_to_response(t) for t in tools])


@router.get("/{tool_id}", response_model=ToolDefinitionResponse)
async def get_tool(
    tool_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        tool = await ToolDefinitionCollection.find_by_id(mongo_db, tool_id)
        if not tool or tool.get("user_id") != current_user.user_id:
            raise HTTPException(status_code=404, detail="Tool not found")
        return _tool_to_response(tool, is_mongo=True)

    tool = db.query(ToolDefinition).filter(
        ToolDefinition.id == int(tool_id),
        ToolDefinition.user_id == int(current_user.user_id),
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return _tool_to_response(tool)


@router.put("/{tool_id}", response_model=ToolDefinitionResponse)
async def update_tool(
    tool_id: str,
    data: ToolDefinitionUpdate,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = data.model_dump(exclude_unset=True)
    if "parameters" in updates:
        updates["parameters_json"] = json.dumps(updates.pop("parameters"))
    if "handler_config" in updates:
        updates["handler_config"] = json.dumps(updates.pop("handler_config")) if updates["handler_config"] else None

    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        updated = await ToolDefinitionCollection.update(mongo_db, tool_id, current_user.user_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Tool not found")
        return _tool_to_response(updated, is_mongo=True)

    tool = db.query(ToolDefinition).filter(
        ToolDefinition.id == int(tool_id),
        ToolDefinition.user_id == int(current_user.user_id),
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    for key, value in updates.items():
        setattr(tool, key, value)
    db.commit()
    db.refresh(tool)
    return _tool_to_response(tool)


@router.delete("/{tool_id}")
async def delete_tool(
    tool_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if DATABASE_TYPE == "mongo":
        mongo_db = get_database()
        success = await ToolDefinitionCollection.delete(mongo_db, tool_id, current_user.user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Tool not found")
        return {"message": "Tool deleted"}

    tool = db.query(ToolDefinition).filter(
        ToolDefinition.id == int(tool_id),
        ToolDefinition.user_id == int(current_user.user_id),
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    tool.is_active = False
    db.commit()
    return {"message": "Tool deleted"}
