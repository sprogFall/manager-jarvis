from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.task import TaskRecord
from app.models.user import User
from app.schemas.stack import ImportStackRequest, StackActionRequest, StackDetail, StackSummary, UpdateComposeRequest
from app.core.config import get_settings
from app.services.stack_service import STACK_NAME_RE, StackService
from app.services.task_service import get_task_manager
from app.utils.confirm import check_confirmation, confirmation_header

router = APIRouter(prefix="/stacks", tags=["stacks"])
settings = get_settings()


def _recent_stack_tasks(db: Session, name: str, limit: int = 5) -> list[dict]:
    stmt = (
        select(TaskRecord)
        .where(TaskRecord.resource_type == "stack", TaskRecord.resource_id == name)
        .order_by(desc(TaskRecord.created_at))
        .limit(limit)
    )
    records = list(db.scalars(stmt))
    return [
        {
            "id": rec.id,
            "task_type": rec.task_type,
            "status": rec.status,
            "created_at": rec.created_at,
            "finished_at": rec.finished_at,
        }
        for rec in records
    ]


@router.get("", response_model=list[StackSummary])
def list_stacks(_: User = Depends(get_current_admin)) -> list[StackSummary]:
    service = StackService()
    return [StackSummary.model_validate(item) for item in service.list_stacks()]


@router.get("/{name}")
def stack_detail(
    name: str,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = StackService()
    detail = StackDetail.model_validate(service.get_stack(name)).model_dump(mode="json")
    detail["recent_operations"] = _recent_stack_tasks(db, name)
    return detail


@router.post("/import")
def import_stack(
    payload: ImportStackRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    if not STACK_NAME_RE.match(payload.name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stack name")

    allowed_files = {"compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"}
    if payload.compose_filename not in allowed_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid compose filename")

    stack_dir = (settings.stacks_path / payload.name).resolve()
    if settings.stacks_path not in stack_dir.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stack name")
    if stack_dir.exists():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stack already exists")
    stack_dir.mkdir(parents=True, exist_ok=False)
    compose_file = stack_dir / payload.compose_filename
    compose_file.write_text(payload.content, encoding="utf-8")

    write_audit_log(
        db,
        action="stack.import",
        resource_type="stack",
        resource_id=payload.name,
        user=user,
        detail={"compose_file": str(compose_file)},
    )
    return {"name": payload.name, "compose_file": str(compose_file)}


@router.put("/{name}/compose")
def update_compose(
    name: str,
    payload: UpdateComposeRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = StackService()
    result = service.update_compose(name, payload.content)
    write_audit_log(
        db,
        action="stack.compose.update",
        resource_type="stack",
        resource_id=name,
        user=user,
    )
    return result


@router.post("/{name}/{action}")
def stack_action(
    name: str,
    action: Literal["up", "down", "restart", "pull"],
    payload: StackActionRequest,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    if action == "up" and payload.force_recreate:
        check_confirmation(payload.confirm, "force-recreate", x_confirm_action)

    task_id = get_task_manager().enqueue(
        db,
        task_type="stack.action",
        params={"name": name, "action": action, "force_recreate": payload.force_recreate},
        created_by=user.username,
        resource_type="stack",
        resource_id=name,
    )
    write_audit_log(
        db,
        action=f"stack.{action}",
        resource_type="stack",
        resource_id=name,
        user=user,
        detail={"task_id": task_id, "force_recreate": payload.force_recreate},
    )
    return {"task_id": task_id}
