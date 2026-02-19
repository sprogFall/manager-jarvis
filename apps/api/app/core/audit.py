from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User


def write_audit_log(
    db: Session,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    user: User | None = None,
    status: str = "success",
    detail: dict[str, Any] | None = None,
) -> None:
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        detail=detail,
    )
    db.add(log)
    db.commit()
