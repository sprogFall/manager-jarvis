from pydantic import BaseModel, Field


class ImageSummary(BaseModel):
    id: str
    tags: list[str]
    size: int
    created: str


class RegistryAuth(BaseModel):
    username: str | None = None
    password: str | None = None
    registry: str | None = None


class PullImageRequest(BaseModel):
    image: str = Field(min_length=1)
    tag: str | None = None
    auth: RegistryAuth | None = None


class BuildImageRequest(BaseModel):
    tag: str = Field(min_length=1)
    path: str | None = None
    dockerfile: str = "Dockerfile"
    no_cache: bool = False
    pull: bool = False
    git_url: str | None = None


class DeleteImageRequest(BaseModel):
    force: bool = False
    noprune: bool = False
    confirm: bool = False


class SaveImageRequest(BaseModel):
    image: str = Field(min_length=1)
    filename: str | None = None
