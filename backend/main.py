from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
import uvicorn

from dotenv import load_dotenv
load_dotenv()

from config import DATABASE_TYPE
from database import engine, Base
from rate_limiter import limiter, rate_limit_exceeded_handler

from routers.auth_router import router as auth_router
from routers.user_router import router as user_router
from routers.providers_router import router as providers_router
from routers.agents_router import router as agents_router
from routers.teams_router import router as teams_router
from routers.workflows_router import router as workflows_router
from routers.sessions_router import router as sessions_router
from routers.chat_router import router as chat_router
from routers.dashboard_router import router as dashboard_router
from routers.tools_router import router as tools_router
from routers.mcp_servers_router import router as mcp_servers_router
from routers.admin_router import router as admin_router
from routers.workflow_runs_router import router as workflow_runs_router
from routers.secrets_router import router as secrets_router
from routers.files_router import router as files_router

if DATABASE_TYPE == "mongo":
    from database_mongo import connect_to_mongo, close_mongo_connection, get_database
    from models_mongo import (
        UserCollection, APIClientCollection, LLMProviderCollection,
        AgentCollection, TeamCollection, WorkflowCollection, WorkflowRunCollection,
        SessionCollection, MessageCollection, ToolDefinitionCollection, MCPServerCollection,
        UserSecretCollection, FileAttachmentCollection,
    )


def _run_sqlite_migrations(engine):
    """Add columns/tables that create_all won't add to existing tables."""
    import sqlalchemy
    with engine.connect() as conn:
        # Add mcp_servers_json to agents if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE agents ADD COLUMN mcp_servers_json TEXT"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add permissions_json to users if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE users ADD COLUMN permissions_json TEXT"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add session_id to workflow_runs if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE workflow_runs ADD COLUMN session_id INTEGER REFERENCES sessions(id)"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add totp_secret to users if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE users ADD COLUMN totp_secret TEXT"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add totp_enabled to users if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT 0"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Create user_secrets table if missing
        try:
            conn.execute(sqlalchemy.text("""
                CREATE TABLE IF NOT EXISTS user_secrets (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    name TEXT NOT NULL,
                    encrypted_value TEXT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add attachments_json to messages if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE messages ADD COLUMN attachments_json TEXT"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add secret_id to llm_providers if missing
        try:
            conn.execute(sqlalchemy.text(
                "ALTER TABLE llm_providers ADD COLUMN secret_id INTEGER"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Create file_attachments table if missing
        try:
            conn.execute(sqlalchemy.text("""
                CREATE TABLE IF NOT EXISTS file_attachments (
                    id INTEGER PRIMARY KEY,
                    session_id INTEGER NOT NULL REFERENCES sessions(id),
                    message_id INTEGER REFERENCES messages(id),
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    filename TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    file_size INTEGER,
                    storage_path TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            conn.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if DATABASE_TYPE == "sqlite":
        Base.metadata.create_all(bind=engine)
        _run_sqlite_migrations(engine)
    elif DATABASE_TYPE == "mongo":
        await connect_to_mongo()
        db = get_database()
        await UserCollection.create_indexes(db)
        await APIClientCollection.create_indexes(db)
        await LLMProviderCollection.create_indexes(db)
        await AgentCollection.create_indexes(db)
        await TeamCollection.create_indexes(db)
        await WorkflowCollection.create_indexes(db)
        await WorkflowRunCollection.create_indexes(db)
        await SessionCollection.create_indexes(db)
        await MessageCollection.create_indexes(db)
        await ToolDefinitionCollection.create_indexes(db)
        await MCPServerCollection.create_indexes(db)
        await UserSecretCollection.create_indexes(db)
        await FileAttachmentCollection.create_indexes(db)
    yield
    if DATABASE_TYPE == "mongo":
        await close_mongo_connection()


app = FastAPI(title="AIos", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(providers_router)
app.include_router(agents_router)
app.include_router(teams_router)
app.include_router(workflows_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(dashboard_router)
app.include_router(tools_router)
app.include_router(mcp_servers_router)
app.include_router(admin_router)
app.include_router(workflow_runs_router)
app.include_router(secrets_router)
app.include_router(files_router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
