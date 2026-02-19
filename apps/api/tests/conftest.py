from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

RUNTIME_DIR = Path(__file__).resolve().parent / ".runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_MINUTES", "10080")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(RUNTIME_DIR / 'test.db').resolve()}")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123456")
os.environ.setdefault("STACKS_DIR", str((RUNTIME_DIR / "stacks").resolve()))
os.environ.setdefault("UPLOAD_DIR", str((RUNTIME_DIR / "uploads").resolve()))
os.environ.setdefault("EXPORT_DIR", str((RUNTIME_DIR / "exports").resolve()))
os.environ.setdefault("WORKSPACES_DIR", str((RUNTIME_DIR / "workspaces").resolve()))
os.environ.setdefault("MAX_UPLOAD_SIZE_MB", "50")
os.environ.setdefault("ENABLE_WEB_TERMINAL", "true")

from app.core.deps import get_current_admin  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.task import TaskRecord  # noqa: E402
from app.services.docker_service import DockerService  # noqa: E402


class FakeTaskManager:
    def __init__(self) -> None:
        self.records: dict[str, TaskRecord] = {}

    def enqueue(
        self,
        db,
        *,
        task_type: str,
        params: dict | None,
        created_by: str | None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        retry_of: str | None = None,
    ) -> str:
        task_id = f"task-{len(self.records) + 1}"
        now = datetime.now(timezone.utc)
        rec = TaskRecord(
            id=task_id,
            task_type=task_type,
            status="queued",
            resource_type=resource_type,
            resource_id=resource_id,
            params=params,
            result=None,
            error=None,
            retry_of=retry_of,
            created_by=created_by,
            created_at=now,
            started_at=None,
            finished_at=None,
        )
        self.records[task_id] = rec
        return task_id

    def get_task(self, db, task_id: str) -> TaskRecord:
        rec = self.records.get(task_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return rec

    def list_tasks(self, db, limit: int = 100) -> list[TaskRecord]:
        values = list(self.records.values())
        values.sort(key=lambda item: item.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return values[:limit]

    def retry(self, db, task_id: str, created_by: str | None = None) -> str:
        rec = self.get_task(db, task_id)
        if rec.status != "failed":
            raise HTTPException(status_code=400, detail="Only failed tasks can be retried")
        return self.enqueue(
            db,
            task_type=rec.task_type,
            params=rec.params,
            created_by=created_by,
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            retry_of=rec.id,
        )


@pytest.fixture(scope="session", autouse=True)
def prepare_runtime() -> None:
    if RUNTIME_DIR.exists():
        shutil.rmtree(RUNTIME_DIR)
    (RUNTIME_DIR / "stacks").mkdir(parents=True, exist_ok=True)
    (RUNTIME_DIR / "uploads").mkdir(parents=True, exist_ok=True)
    (RUNTIME_DIR / "exports").mkdir(parents=True, exist_ok=True)
    (RUNTIME_DIR / "workspaces").mkdir(parents=True, exist_ok=True)


@pytest.fixture
def raw_client():
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_state(raw_client):
    with SessionLocal() as db:
        db.query(AuditLog).delete()
        db.query(TaskRecord).delete()
        db.commit()

    for folder in (RUNTIME_DIR / "stacks", RUNTIME_DIR / "uploads", RUNTIME_DIR / "exports", RUNTIME_DIR / "workspaces"):
        folder.mkdir(parents=True, exist_ok=True)
        for child in folder.iterdir():
            if child.is_file() or child.is_symlink():
                child.unlink(missing_ok=True)
            elif child.is_dir():
                shutil.rmtree(child)

    yield


@pytest.fixture(autouse=True)
def stub_docker_service_init(monkeypatch):
    def fake_init(self) -> None:
        self.client = SimpleNamespace()

    monkeypatch.setattr(DockerService, "__init__", fake_init)


@pytest.fixture
def client(raw_client):
    app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(
        id=1,
        username="admin",
        is_admin=True,
        is_active=True,
    )
    yield raw_client
    app.dependency_overrides.pop(get_current_admin, None)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def fake_task_manager(monkeypatch):
    manager = FakeTaskManager()

    import app.api.v1.containers as containers_api
    import app.api.v1.images as images_api
    import app.api.v1.stacks as stacks_api
    import app.api.v1.tasks as tasks_api

    monkeypatch.setattr(containers_api, "get_task_manager", lambda: manager)
    monkeypatch.setattr(images_api, "get_task_manager", lambda: manager)
    monkeypatch.setattr(stacks_api, "get_task_manager", lambda: manager)
    monkeypatch.setattr(tasks_api, "get_task_manager", lambda: manager)

    return manager


@pytest.fixture
def runtime_paths() -> dict[str, Path]:
    return {
        "root": RUNTIME_DIR,
        "stacks": RUNTIME_DIR / "stacks",
        "uploads": RUNTIME_DIR / "uploads",
        "exports": RUNTIME_DIR / "exports",
        "workspaces": RUNTIME_DIR / "workspaces",
    }
