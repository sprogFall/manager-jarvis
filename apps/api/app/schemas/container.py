from pydantic import BaseModel, Field


class ContainerStats(BaseModel):
    cpu_percent: float = 0.0
    memory_usage: int = 0
    memory_limit: int = 0
    memory_percent: float = 0.0


class ContainerSummary(BaseModel):
    id: str
    name: str
    image: str
    status: str
    state: str
    ports: list[str] = Field(default_factory=list)
    stats: ContainerStats | None = None


class ContainerDetail(BaseModel):
    id: str
    name: str
    image: str
    status: str
    state: str
    command: str
    created: str
    env: list[str]
    mounts: list[dict]
    networks: dict
    ports: dict


class ContainerActionResponse(BaseModel):
    id: str
    action: str
    status: str = "ok"


class BatchStopRequest(BaseModel):
    container_ids: list[str] = Field(min_length=1)
    confirm: bool = False


class CreateContainerRequest(BaseModel):
    image: str = Field(min_length=1)
    name: str | None = None
    command: str | list[str] | None = None
    environment: dict[str, str] | None = None
    ports: dict[str, str | int] | None = None
    volumes: dict[str, dict[str, str]] | None = None
    network: str | None = None
    restart_policy: dict[str, str] | None = None
    detach: bool = True


class ExecRequest(BaseModel):
    cmd: list[str] | str = Field(min_length=1)
    user: str | None = None
    workdir: str | None = None
    tty: bool = False
    privileged: bool = False


class ExecResponse(BaseModel):
    exit_code: int
    output: str
