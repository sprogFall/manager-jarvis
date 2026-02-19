from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

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


def _resolve_frontend_file(frontend_path: str) -> Path | None:
    dist = settings.frontend_dist_path
    if dist is None:
        return None

    clean_path = frontend_path.strip("/")
    if clean_path == "api" or clean_path.startswith("api/"):
        return None

    if clean_path == "":
        index_file = dist / "index.html"
        return index_file if index_file.is_file() else None

    target = (dist / clean_path).resolve()
    if dist not in target.parents and target != dist:
        return None

    if target.is_file():
        return target

    if target.is_dir():
        index_file = target / "index.html"
        if index_file.is_file():
            return index_file

    if "." not in Path(clean_path).name:
        html_file = (dist / f"{clean_path}.html").resolve()
        if (dist in html_file.parents or html_file == dist) and html_file.is_file():
            return html_file

    fallback_file = dist / "index.html"
    if fallback_file.is_file():
        return fallback_file
    return None


@app.get("/{frontend_path:path}", include_in_schema=False)
def frontend_fallback(frontend_path: str):
    file_path = _resolve_frontend_file(frontend_path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path)
