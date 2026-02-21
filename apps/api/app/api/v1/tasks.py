from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import get_settings
from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.task import TaskRecord
from app.models.user import User
from app.schemas.task import RetryTaskResponse, TaskResponse
from app.services.task_service import get_task_manager

settings = get_settings()
router = APIRouter(prefix="/tasks", tags=["tasks"])

MAX_LOG_TAIL_LINES = 5000
MAX_LOG_BYTES = 1024 * 1024  # 1 MiB


def _read_log_tail(file_path: Path, tail: int) -> str:
    if tail <= 0:
        return ""
    data = file_path.read_bytes()
    if len(data) > MAX_LOG_BYTES:
        data = data[-MAX_LOG_BYTES:]
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines(keepends=True)
    if len(lines) <= tail:
        return "".join(lines)
    return "".join(lines[-tail:])


def _to_task_response(rec: TaskRecord) -> TaskResponse:
    return TaskResponse(
        id=rec.id,
        task_type=rec.task_type,
        status=rec.status,
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        params=rec.params,
        result=rec.result,
        error=rec.error,
        retry_of=rec.retry_of,
        created_by=rec.created_by,
        created_at=rec.created_at,
        started_at=rec.started_at,
        finished_at=rec.finished_at,
    )


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[TaskResponse]:
    records = get_task_manager().list_tasks(db, limit=limit)
    return [_to_task_response(rec) for rec in records]


@router.get("/{task_id}", response_model=TaskResponse)
def task_detail(task_id: str, _: User = Depends(get_current_admin), db: Session = Depends(get_db)) -> TaskResponse:
    rec = get_task_manager().get_task(db, task_id)
    return _to_task_response(rec)


@router.post("/{task_id}/retry", response_model=RetryTaskResponse)
def retry_task(
    task_id: str,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> RetryTaskResponse:
    new_id = get_task_manager().retry(db, task_id, created_by=user.username)
    write_audit_log(
        db,
        action="task.retry",
        resource_type="task",
        resource_id=task_id,
        user=user,
        detail={"new_task_id": new_id},
    )
    return RetryTaskResponse(original_task_id=task_id, new_task_id=new_id)


@router.get("/{task_id}/download")
def download_task_file(
    task_id: str,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> FileResponse:
    rec = get_task_manager().get_task(db, task_id)
    if rec.status != "success" or not rec.result or "file" not in rec.result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task has no downloadable file")

    file_path = Path(rec.result["file"]).resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")

    allowed_dirs = [settings.export_path.resolve(), settings.upload_path.resolve()]
    if not any(allowed in file_path.parents for allowed in allowed_dirs):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="File path not allowed")

    return FileResponse(path=file_path, filename=file_path.name, media_type="application/octet-stream")


@router.get("/{task_id}/logs")
def get_task_logs(
    task_id: str,
    tail: int = Query(default=200, ge=0, le=MAX_LOG_TAIL_LINES),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    # Ensure task exists and caller has access.
    get_task_manager().get_task(db, task_id)

    logs_root = settings.task_logs_path.resolve()
    file_path = (logs_root / f"{task_id}.log").resolve()
    if logs_root not in file_path.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task_id")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task log not found")

    content = _read_log_tail(file_path, tail=tail)
    return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8")
