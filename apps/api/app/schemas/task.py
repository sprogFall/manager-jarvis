from datetime import datetime

from pydantic import BaseModel


class TaskResponse(BaseModel):
    id: str
    task_type: str
    status: str
    resource_type: str | None
    resource_id: str | None
    params: dict | None
    result: dict | None
    error: str | None
    retry_of: str | None
    created_by: str | None
    created_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None


class RetryTaskResponse(BaseModel):
    original_task_id: str
    new_task_id: str
