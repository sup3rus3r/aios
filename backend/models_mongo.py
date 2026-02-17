from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, handler):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, schema, handler):
        return {"type": "string"}


class UserMongo(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    username: str
    email: str
    role: str
    hashed_password: str
    permissions: Optional[dict] = None
    totp_secret: Optional[str] = None
    totp_enabled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str},
    }


class UserCollection:
    collection_name = "users"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("username", unique=True)
        await collection.create_index("email", unique=True)

    @classmethod
    async def find_by_username(cls, db, username: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"username": username})

    @classmethod
    async def find_by_email(cls, db, email: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"email": email})

    @classmethod
    async def create(cls, db, user_data: dict) -> dict:
        collection = db[cls.collection_name]
        result = await collection.insert_one(user_data)
        user_data["_id"] = result.inserted_id
        return user_data

    @classmethod
    async def find_by_id(cls, db, user_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(user_id)})

    @classmethod
    async def update_role(cls, db, user_id: str, new_role: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        result = await collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": {"role": new_role}},
            return_document=True
        )
        return result

    @classmethod
    async def find_all(cls, db) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({})
        return await cursor.to_list(length=1000)

    @classmethod
    async def update_user(cls, db, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def update_password(cls, db, user_id: str, hashed_password: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": {"hashed_password": hashed_password}},
            return_document=True
        )

    @classmethod
    async def update_totp(cls, db, user_id: str, totp_secret: Optional[str], totp_enabled: bool) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": {"totp_secret": totp_secret, "totp_enabled": totp_enabled}},
            return_document=True
        )

    @classmethod
    async def delete_user(cls, db, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.delete_one({"_id": ObjectId(user_id)})
        return result.deleted_count > 0


class APIClientMongo(BaseModel):
    """API client model for MongoDB."""
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    name            : str
    client_id       : str
    hashed_secret   : str
    created_by      : str
    is_active       : bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str},
    }


class APIClientCollection:
    """Collection helper for API clients in MongoDB."""
    collection_name = "api_clients"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("client_id", unique=True)

    @classmethod
    async def find_by_client_id(cls, db, client_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"client_id": client_id, "is_active": True})

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"created_by": user_id})
        return await cursor.to_list(length=100)

    @classmethod
    async def create(cls, db, client_data: dict) -> dict:
        collection = db[cls.collection_name]
        result = await collection.insert_one(client_data)
        client_data["_id"] = result.inserted_id
        return client_data

    @classmethod
    async def deactivate(cls, db, client_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"client_id": client_id, "created_by": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


# ============================================================================
# AIos Collections
# ============================================================================

class LLMProviderCollection:
    collection_name = "llm_providers"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, provider_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(provider_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, provider_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(provider_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, provider_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(provider_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class AgentCollection:
    collection_name = "agents"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, agent_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(agent_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, agent_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(agent_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, agent_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(agent_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class TeamCollection:
    collection_name = "teams"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, team_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(team_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, team_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(team_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, team_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(team_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class WorkflowCollection:
    collection_name = "workflows"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, workflow_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(workflow_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, workflow_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(workflow_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, workflow_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(workflow_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class WorkflowRunCollection:
    collection_name = "workflow_runs"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")
        await collection.create_index("workflow_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id}).sort("started_at", -1)
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_workflow(cls, db, workflow_id: str, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"workflow_id": workflow_id, "user_id": user_id}).sort("started_at", -1)
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, run_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(run_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("status", "running")
        data.setdefault("current_step", 0)
        data.setdefault("started_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, run_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one_and_update(
            {"_id": ObjectId(run_id)},
            {"$set": updates},
            return_document=True
        )


class SessionCollection:
    collection_name = "sessions"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")
        await collection.create_index([("entity_type", 1), ("entity_id", 1)])

    @classmethod
    async def find_by_user(cls, db, user_id: str, entity_type: str = None, entity_id: str = None) -> list[dict]:
        collection = db[cls.collection_name]
        query = {"user_id": user_id, "is_active": True}
        if entity_type:
            query["entity_type"] = entity_type
        if entity_id:
            query["entity_id"] = entity_id
        cursor = collection.find(query).sort("updated_at", -1)
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, session_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(session_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        data.setdefault("updated_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, session_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(session_id)},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, session_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(session_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class MessageCollection:
    collection_name = "messages"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("session_id")
        await collection.create_index("created_at")

    @classmethod
    async def find_by_session(cls, db, session_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"session_id": session_id}).sort("created_at", 1).skip(offset).limit(limit)
        return await cursor.to_list(length=limit)

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data


class ToolDefinitionCollection:
    collection_name = "tool_definitions"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, tool_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(tool_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, tool_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one_and_update(
            {"_id": ObjectId(tool_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, tool_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(tool_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class MCPServerCollection:
    collection_name = "mcp_servers"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id, "is_active": True})
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, server_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(server_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("is_active", True)
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, server_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(server_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, server_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.update_one(
            {"_id": ObjectId(server_id), "user_id": user_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0


class FileAttachmentCollection:
    collection_name = "file_attachments"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("session_id")
        await collection.create_index("user_id")

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("created_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def find_by_session(cls, db, session_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"session_id": session_id})
        return await cursor.to_list(length=500)

    @classmethod
    async def find_by_id(cls, db, file_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(file_id)})


class UserSecretCollection:
    collection_name = "user_secrets"

    @classmethod
    async def create_indexes(cls, db):
        collection = db[cls.collection_name]
        await collection.create_index("user_id")

    @classmethod
    async def find_by_user(cls, db, user_id: str) -> list[dict]:
        collection = db[cls.collection_name]
        cursor = collection.find({"user_id": user_id}).sort("created_at", -1)
        return await cursor.to_list(length=100)

    @classmethod
    async def find_by_id(cls, db, secret_id: str) -> Optional[dict]:
        collection = db[cls.collection_name]
        return await collection.find_one({"_id": ObjectId(secret_id)})

    @classmethod
    async def create(cls, db, data: dict) -> dict:
        collection = db[cls.collection_name]
        data.setdefault("created_at", datetime.utcnow())
        data.setdefault("updated_at", datetime.utcnow())
        result = await collection.insert_one(data)
        data["_id"] = result.inserted_id
        return data

    @classmethod
    async def update(cls, db, secret_id: str, user_id: str, updates: dict) -> Optional[dict]:
        collection = db[cls.collection_name]
        updates["updated_at"] = datetime.utcnow()
        return await collection.find_one_and_update(
            {"_id": ObjectId(secret_id), "user_id": user_id},
            {"$set": updates},
            return_document=True
        )

    @classmethod
    async def delete(cls, db, secret_id: str, user_id: str) -> bool:
        collection = db[cls.collection_name]
        result = await collection.delete_one(
            {"_id": ObjectId(secret_id), "user_id": user_id}
        )
        return result.deleted_count > 0
