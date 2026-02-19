from pydantic import BaseModel, Field


class StackSummary(BaseModel):
    name: str
    path: str
    compose_file: str
    services: list[dict] = Field(default_factory=list)


class StackDetail(BaseModel):
    name: str
    compose_file: str
    content: str
    services: list[dict]


class UpdateComposeRequest(BaseModel):
    content: str = Field(min_length=1)


class StackActionRequest(BaseModel):
    force_recreate: bool = False
    confirm: bool = False


class ImportStackRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    content: str = Field(min_length=1)
    compose_filename: str = "compose.yaml"
