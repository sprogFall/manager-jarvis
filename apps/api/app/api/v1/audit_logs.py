from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    user: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = select(AuditLog)
    if user:
        stmt = stmt.where(AuditLog.username == user)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    stmt = stmt.order_by(desc(AuditLog.created_at)).limit(limit)

    records = list(db.scalars(stmt))
    return [
        AuditLogResponse(
            id=rec.id,
            user_id=rec.user_id,
            username=rec.username,
            action=rec.action,
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            status=rec.status,
            detail=rec.detail,
            created_at=rec.created_at,
        )
        for rec in records
    ]
