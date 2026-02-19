from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    user_id: int | None
    username: str | None
    action: str
    resource_type: str
    resource_id: str | None
    status: str
    detail: dict | None
    created_at: datetime | None
