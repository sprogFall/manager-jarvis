from typing import Literal

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


class WorkspaceSummary(BaseModel):
    workspace_id: str
    repo_url: str | None = None
    branch: str | None = None
    created_at: str | None = None
    updated_at: str
    compose_files_count: int = 0


class WorkspaceInfo(BaseModel):
    workspace_id: str
    dockerfiles: list[str]
    directories: list[str]
    compose_files: list[str] = Field(default_factory=list)


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


class WorkspaceComposeInfo(BaseModel):
    workspace_id: str
    compose_files: list[str]
    selected_compose: str
    source: Literal["repository", "custom"] = "repository"
    custom_exists: bool = False
    project_name: str
    content: str


class WorkspaceComposeUpdateRequest(BaseModel):
    compose_path: str | None = None
    content: str = Field(min_length=1)


class WorkspaceComposeActionRequest(BaseModel):
    compose_path: str | None = None
    source: Literal["repository", "custom"] = "custom"
    project_name: str | None = None
    force_recreate: bool = False
    confirm: bool = False
