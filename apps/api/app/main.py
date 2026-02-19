from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.init_db import ensure_admin_user, init_db
from app.db.session import SessionLocal
from app.services.docker_service import DockerService
from app.services.task_service import get_task_manager

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.stacks_path.mkdir(parents=True, exist_ok=True)
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    settings.export_path.mkdir(parents=True, exist_ok=True)

    init_db()
    db = SessionLocal()
    try:
        ensure_admin_user(db)
    finally:
        db.close()

    get_task_manager()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/healthz")
def healthz() -> dict:
    docker_ok = DockerService().ping()
    return {"status": "ok", "docker": docker_ok}
