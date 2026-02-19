from __future__ import annotations

import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.task import TaskRecord
from app.services.docker_service import DockerService
from app.services.stack_service import StackService

settings = get_settings()
TaskHandler = Callable[[dict[str, Any]], dict[str, Any]]


class TaskManager:
    def __init__(self, max_workers: int = 4) -> None:
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="jarvis-task")
        self.handlers: dict[str, TaskHandler] = {}

    def register(self, task_type: str, handler: TaskHandler) -> None:
        self.handlers[task_type] = handler

    def enqueue(
        self,
        db: Session,
        *,
        task_type: str,
        params: dict[str, Any] | None,
        created_by: str | None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        retry_of: str | None = None,
    ) -> str:
        if task_type not in self.handlers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task type not registered: {task_type}")

        task_id = uuid.uuid4().hex
        rec = TaskRecord(
            id=task_id,
            task_type=task_type,
            status="queued",
            params=params,
            created_by=created_by,
            resource_type=resource_type,
            resource_id=resource_id,
            retry_of=retry_of,
        )
        db.add(rec)
        db.commit()

        self.executor.submit(self._run_task, task_id)
        return task_id

    def _run_task(self, task_id: str) -> None:
        db = SessionLocal()
        try:
            rec = db.scalar(select(TaskRecord).where(TaskRecord.id == task_id))
            if not rec:
                return
            rec.status = "running"
            rec.started_at = datetime.now(timezone.utc)
            db.commit()

            handler = self.handlers.get(rec.task_type)
            if not handler:
                raise RuntimeError(f"No handler for task type {rec.task_type}")

            result = handler(rec.params or {})

            rec.status = "success"
            rec.result = result
            rec.error = None
            rec.finished_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as exc:  # noqa: BLE001
            rec = db.scalar(select(TaskRecord).where(TaskRecord.id == task_id))
            if rec:
                rec.status = "failed"
                rec.error = f"{exc}\n{traceback.format_exc()}"
                rec.finished_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()

    def get_task(self, db: Session, task_id: str) -> TaskRecord:
        rec = db.scalar(select(TaskRecord).where(TaskRecord.id == task_id))
        if not rec:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return rec

    def list_tasks(self, db: Session, limit: int = 100) -> list[TaskRecord]:
        stmt = select(TaskRecord).order_by(desc(TaskRecord.created_at)).limit(limit)
        return list(db.scalars(stmt))

    def retry(self, db: Session, task_id: str, created_by: str | None = None) -> str:
        rec = self.get_task(db, task_id)
        if rec.status != "failed":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only failed tasks can be retried")
        return self.enqueue(
            db,
            task_type=rec.task_type,
            params=rec.params,
            created_by=created_by,
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            retry_of=rec.id,
        )


_task_manager: TaskManager | None = None


def get_task_manager() -> TaskManager:
    global _task_manager
    if _task_manager is None:
        _task_manager = TaskManager(max_workers=4)
        register_default_handlers(_task_manager)
    return _task_manager


def task_pull_image(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    auth = params.get("auth")
    return service.pull_image(params["image"], params.get("tag"), auth=auth)


def task_build_image(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    return service.build_image(
        tag=params["tag"],
        path=params.get("path"),
        dockerfile=params.get("dockerfile", "Dockerfile"),
        no_cache=params.get("no_cache", False),
        pull=params.get("pull", False),
        git_url=params.get("git_url"),
    )


def task_build_image_upload(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    archive_path = Path(params["file_path"])
    try:
        return service.build_image_from_archive(
            tag=params["tag"],
            archive_path=archive_path,
            dockerfile=params.get("dockerfile", "Dockerfile"),
            no_cache=params.get("no_cache", False),
            pull=params.get("pull", False),
        )
    finally:
        archive_path.unlink(missing_ok=True)


def task_load_image(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    path = Path(params["file_path"])
    try:
        return service.load_image_from_file(path)
    finally:
        path.unlink(missing_ok=True)


def task_save_image(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    settings.export_path.mkdir(parents=True, exist_ok=True)
    output = settings.export_path / Path(params["filename"]).name
    return service.save_image_to_file(params["image"], output)


def task_stack_action(params: dict[str, Any]) -> dict[str, Any]:
    service = StackService()
    return service.run_action(params["name"], params["action"], params.get("force_recreate", False))


def task_export_logs(params: dict[str, Any]) -> dict[str, Any]:
    service = DockerService()
    settings.export_path.mkdir(parents=True, exist_ok=True)
    filename = Path(params["filename"]).name
    output = settings.export_path / filename
    text = service.get_logs_text(
        params["container_id"],
        tail=params.get("tail", 1000),
        since=params.get("since"),
        until=params.get("until"),
        timestamps=True,
        search=params.get("search"),
    )
    output.write_text(text, encoding="utf-8")
    return {"file": str(output), "size": output.stat().st_size}


def register_default_handlers(task_manager: TaskManager) -> None:
    task_manager.register("image.pull", task_pull_image)
    task_manager.register("image.build", task_build_image)
    task_manager.register("image.build.upload", task_build_image_upload)
    task_manager.register("image.load", task_load_image)
    task_manager.register("image.save", task_save_image)
    task_manager.register("stack.action", task_stack_action)
    task_manager.register("container.logs.export", task_export_logs)
