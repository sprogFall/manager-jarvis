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


class GitCloneRequest(BaseModel):
    repo_url: str = Field(min_length=1)
    branch: str | None = None
    token: str | None = None  # personal access token for private repos


class WorkspaceInfo(BaseModel):
    workspace_id: str
    dockerfiles: list[str]
    directories: list[str]


class BuildFromWorkspaceRequest(BaseModel):
    tag: str = Field(min_length=1)
    context_path: str = "."
    dockerfile: str = "Dockerfile"
    no_cache: bool = False
    pull: bool = False
    cleanup_after: bool = True  # auto-remove workspace after build


class LoadFromUrlRequest(BaseModel):
    url: str = Field(min_length=1)
    auth_token: str | None = None  # Bearer token for private GitHub/Gitee release assets
