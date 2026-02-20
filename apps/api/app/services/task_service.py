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


def task_git_clone(params: dict[str, Any]) -> dict[str, Any]:
    from app.services.git_service import GitService
    from app.services.proxy_service import get_runtime_proxy_url

    service = GitService()
    proxy_url = get_runtime_proxy_url()
    workspace_id, workspace_path = service.clone(
        repo_url=params["repo_url"],
        branch=params.get("branch"),
        token=params.get("token"),
        proxy_url=proxy_url,
    )
    info = service.list_workspace(workspace_id)
    return {**info, "workspace_path": str(workspace_path)}


def task_build_from_workspace(params: dict[str, Any]) -> dict[str, Any]:
    from app.services.git_service import GitService

    docker_service = DockerService()
    git_service = GitService()
    workspace_id = params["workspace_id"]
    try:
        workspace_path = git_service.get_workspace_path(workspace_id)
        context_rel = params.get("context_path") or "."
        build_path = str((workspace_path / context_rel).resolve())
        return docker_service.build_image(
            tag=params["tag"],
            path=build_path,
            dockerfile=params.get("dockerfile", "Dockerfile"),
            no_cache=params.get("no_cache", False),
            pull=params.get("pull", False),
        )
    finally:
        if params.get("cleanup_after", True):
            git_service.cleanup(workspace_id)


def task_load_image_from_url(params: dict[str, Any]) -> dict[str, Any]:
    import ssl
    import urllib.request
    import uuid as _uuid

    from app.services.proxy_service import get_runtime_proxy_url

    docker_service = DockerService()
    url = params["url"]
    auth_token = params.get("auth_token")
    proxy_url = get_runtime_proxy_url()

    # Determine filename from URL path
    url_path = url.split("?")[0].rstrip("/")
    filename = url_path.split("/")[-1] if "/" in url_path else "image.tar"
    if not (filename.endswith(".tar") or filename.endswith(".tar.gz")):
        filename += ".tar"

    settings.upload_path.mkdir(parents=True, exist_ok=True)
    temp_path = settings.upload_path / f"url_{_uuid.uuid4().hex}_{Path(filename).name}"

    max_size = settings.max_upload_size_mb * 1024 * 1024
    request = urllib.request.Request(url)
    if auth_token:
        request.add_header("Authorization", f"Bearer {auth_token}")

    ctx = ssl.create_default_context()
    handlers: list = [urllib.request.HTTPSHandler(context=ctx)]
    if proxy_url:
        handlers.insert(0, urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
    opener = urllib.request.build_opener(*handlers)
    try:
        with opener.open(request, timeout=600) as response:
            # Honour Content-Disposition filename if present
            content_disposition = response.headers.get("Content-Disposition", "")
            if "filename=" in content_disposition:
                cd_filename = content_disposition.split("filename=")[-1].strip('" ')
                if cd_filename:
                    filename = cd_filename
                    temp_path = settings.upload_path / f"url_{_uuid.uuid4().hex}_{Path(filename).name}"

            total = 0
            with temp_path.open("wb") as fp:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_size:
                        fp.close()
                        temp_path.unlink(missing_ok=True)
                        raise ValueError(
                            f"Download exceeds size limit of {settings.max_upload_size_mb} MB"
                        )
                    fp.write(chunk)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    try:
        return docker_service.load_image_from_file(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


def task_workspace_compose_action(params: dict[str, Any]) -> dict[str, Any]:
    service = StackService()
    compose_file = Path(params["compose_file"])
    project_directory = Path(params["project_directory"]) if params.get("project_directory") else None
    return service.run_compose_action(
        project_name=params["project_name"],
        compose_file=compose_file,
        action=params["action"],
        force_recreate=params.get("force_recreate", False),
        project_directory=project_directory,
    )


def task_git_sync(params: dict[str, Any]) -> dict[str, Any]:
    from app.services.git_service import GitService
    from app.services.proxy_service import get_runtime_proxy_url

    service = GitService()
    proxy_url = get_runtime_proxy_url()
    return service.sync_workspace(params["workspace_id"], proxy_url=proxy_url)


def register_default_handlers(task_manager: TaskManager) -> None:
    task_manager.register("image.pull", task_pull_image)
    task_manager.register("image.build", task_build_image)
    task_manager.register("image.build.upload", task_build_image_upload)
    task_manager.register("image.load", task_load_image)
    task_manager.register("image.save", task_save_image)
    task_manager.register("stack.action", task_stack_action)
    task_manager.register("container.logs.export", task_export_logs)
    task_manager.register("image.git.clone", task_git_clone)
    task_manager.register("image.git.build", task_build_from_workspace)
    task_manager.register("image.load.url", task_load_image_from_url)
    task_manager.register("image.git.compose.action", task_workspace_compose_action)
    task_manager.register("image.git.sync", task_git_sync)
