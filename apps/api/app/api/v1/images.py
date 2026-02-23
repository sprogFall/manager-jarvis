from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import get_settings
from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.image import (
    BuildFromWorkspaceRequest,
    BuildImageRequest,
    GitCloneRequest,
    ImageSummary,
    LoadFromUrlRequest,
    PullImageRequest,
    SaveImageRequest,
    WorkspaceComposeActionRequest,
    WorkspaceComposeInfo,
    WorkspaceComposeUpdateRequest,
    WorkspaceEnvUpdateRequest,
    WorkspaceInfo,
    WorkspaceSummary,
)
from app.services.docker_service import DockerService
from app.services.git_service import GitService
from app.services.stack_service import STACK_NAME_RE
from app.services.task_service import get_task_manager
from app.utils.confirm import check_confirmation, confirmation_header

settings = get_settings()
router = APIRouter(prefix="/images", tags=["images"])


@router.get("", response_model=list[ImageSummary])
def list_images(_: User = Depends(get_current_admin)) -> list[ImageSummary]:
    service = DockerService()
    return [ImageSummary.model_validate(item) for item in service.list_images()]


@router.post("/pull")
def pull_image(
    payload: PullImageRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.pull",
        params=payload.model_dump(mode="json"),
        created_by=user.username,
        resource_type="image",
        resource_id=payload.image,
    )
    write_audit_log(
        db,
        action="image.pull",
        resource_type="image",
        resource_id=payload.image,
        user=user,
        detail={"task_id": task_id, "tag": payload.tag},
    )
    return {"task_id": task_id}


@router.post("/build")
def build_image(
    payload: BuildImageRequest,
    confirm: bool = Query(default=False),
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    if not payload.path and not payload.git_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="path or git_url is required")
    if payload.no_cache:
        check_confirmation(confirm, "force-rebuild", x_confirm_action)

    task_id = get_task_manager().enqueue(
        db,
        task_type="image.build",
        params=payload.model_dump(mode="json"),
        created_by=user.username,
        resource_type="image",
        resource_id=payload.tag,
    )
    write_audit_log(
        db,
        action="image.build",
        resource_type="image",
        resource_id=payload.tag,
        user=user,
        detail={"task_id": task_id},
    )
    return {"task_id": task_id}


@router.post("/build/upload")
async def build_image_upload(
    tag: str = Form(...),
    file: UploadFile = File(...),
    dockerfile: str = Form(default="Dockerfile"),
    no_cache: bool = Form(default=False),
    pull: bool = Form(default=False),
    confirm: bool = Query(default=False),
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    if no_cache:
        check_confirmation(confirm, "force-rebuild", x_confirm_action)
    service = DockerService()
    temp_file = await service.save_upload_temp(file)
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.build.upload",
        params={
            "tag": tag,
            "file_path": str(temp_file),
            "dockerfile": dockerfile,
            "no_cache": no_cache,
            "pull": pull,
        },
        created_by=user.username,
        resource_type="image",
        resource_id=tag,
    )
    write_audit_log(
        db,
        action="image.build.upload",
        resource_type="image",
        resource_id=tag,
        user=user,
        detail={"task_id": task_id, "upload": str(temp_file)},
    )
    return {"task_id": task_id}


@router.post("/load")
async def load_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = DockerService()
    temp_file = await service.save_upload_temp(file)
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.load",
        params={"file_path": str(temp_file)},
        created_by=user.username,
        resource_type="image",
        resource_id=file.filename,
    )
    write_audit_log(
        db,
        action="image.load",
        resource_type="image",
        resource_id=file.filename,
        user=user,
        detail={"task_id": task_id, "upload": str(temp_file)},
    )
    return {"task_id": task_id}


@router.post("/save")
def save_image(
    payload: SaveImageRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    settings.export_path.mkdir(parents=True, exist_ok=True)
    raw_name = payload.filename or f"{payload.image.replace('/', '_').replace(':', '_')}.tar"
    filename = Path(raw_name).name
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.save",
        params={"image": payload.image, "filename": filename},
        created_by=user.username,
        resource_type="image",
        resource_id=payload.image,
    )
    write_audit_log(
        db,
        action="image.save",
        resource_type="image",
        resource_id=payload.image,
        user=user,
        detail={"task_id": task_id, "filename": filename},
    )
    return {"task_id": task_id}


@router.get("/exports/{filename}")
def download_export(filename: str, _: User = Depends(get_current_admin)) -> FileResponse:
    path = (settings.export_path / filename).resolve()
    if not path.exists() or not path.is_file() or settings.export_path not in path.parents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(path=path, filename=Path(filename).name, media_type="application/octet-stream")


# ---------------------------------------------------------------------------
# Git-based build workflow: clone → browse → build
# ---------------------------------------------------------------------------


@router.post("/git/clone")
def git_clone_repo(
    payload: GitCloneRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.git.clone",
        params=payload.model_dump(mode="json"),
        created_by=user.username,
        resource_type="image",
        resource_id=payload.repo_url,
    )
    write_audit_log(
        db,
        action="image.git.clone",
        resource_type="image",
        resource_id=payload.repo_url,
        user=user,
        detail={"task_id": task_id},
    )
    return {"task_id": task_id}


@router.get("/git/workspaces", response_model=list[WorkspaceSummary])
def list_workspaces(_: User = Depends(get_current_admin)) -> list[WorkspaceSummary]:
    service = GitService()
    return [WorkspaceSummary.model_validate(item) for item in service.list_workspaces()]


@router.get("/git/workspace/{workspace_id}", response_model=WorkspaceInfo)
def get_workspace(
    workspace_id: str,
    _: User = Depends(get_current_admin),
) -> WorkspaceInfo:
    service = GitService()
    try:
        info = service.list_workspace(workspace_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WorkspaceInfo.model_validate(info)


@router.get("/git/workspace/{workspace_id}/compose", response_model=WorkspaceComposeInfo)
def get_workspace_compose(
    workspace_id: str,
    compose_path: str | None = Query(default=None),
    source: Literal["repository", "custom"] = Query(default="repository"),
    _: User = Depends(get_current_admin),
) -> WorkspaceComposeInfo:
    service = GitService()
    try:
        info = service.read_workspace_compose(workspace_id, compose_path=compose_path, source=source)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkspaceComposeInfo.model_validate(info)


@router.put("/git/workspace/{workspace_id}/compose")
def update_workspace_compose(
    workspace_id: str,
    payload: WorkspaceComposeUpdateRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = GitService()
    try:
        result = service.save_workspace_compose_override(
            workspace_id,
            content=payload.content,
            compose_path=payload.compose_path,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    write_audit_log(
        db,
        action="image.git.compose.override.update",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={"compose_path": result["compose_path"]},
    )
    return result


@router.delete("/git/workspace/{workspace_id}/compose")
def clear_workspace_compose(
    workspace_id: str,
    compose_path: str | None = Query(default=None),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = GitService()
    try:
        result = service.clear_workspace_compose_override(workspace_id, compose_path=compose_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    write_audit_log(
        db,
        action="image.git.compose.override.clear",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={"compose_path": result["compose_path"], "deleted": result["deleted"]},
    )
    return result


@router.post("/git/workspace/{workspace_id}/compose/{action}")
def run_workspace_compose_action(
    workspace_id: str,
    action: Literal["up", "down", "restart", "pull"],
    payload: WorkspaceComposeActionRequest,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    if action == "up" and payload.force_recreate:
        check_confirmation(payload.confirm, "force-recreate", x_confirm_action)

    if payload.project_name and not STACK_NAME_RE.match(payload.project_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stack name")

    service = GitService()
    try:
        target = service.resolve_workspace_compose_target(
            workspace_id,
            compose_path=payload.compose_path,
            source=payload.source,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    compose_path = target["compose_path"]
    project_name = payload.project_name or service.suggest_project_name(workspace_id, compose_path)
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.git.compose.action",
        params={
            "workspace_id": workspace_id,
            "compose_path": compose_path,
            "compose_file": target["compose_file"],
            "project_directory": target["project_directory"],
            "source": payload.source,
            "project_name": project_name,
            "action": action,
            "force_recreate": payload.force_recreate,
        },
        created_by=user.username,
        resource_type="stack",
        resource_id=project_name,
    )
    write_audit_log(
        db,
        action=f"image.git.compose.{action}",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={
            "task_id": task_id,
            "compose_path": compose_path,
            "source": payload.source,
            "project_name": project_name,
            "force_recreate": payload.force_recreate,
        },
    )
    return {"task_id": task_id}


@router.post("/git/workspace/{workspace_id}/sync")
def sync_workspace(
    workspace_id: str,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = GitService()
    try:
        service.get_workspace_path(workspace_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    task_id = get_task_manager().enqueue(
        db,
        task_type="image.git.sync",
        params={"workspace_id": workspace_id},
        created_by=user.username,
        resource_type="image",
        resource_id=workspace_id,
    )
    write_audit_log(
        db,
        action="image.git.sync",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={"task_id": task_id},
    )
    return {"task_id": task_id}


@router.post("/git/workspace/{workspace_id}/build")
def build_from_workspace(
    workspace_id: str,
    payload: BuildFromWorkspaceRequest,
    confirm: bool = Query(default=False),
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    git_service = GitService()
    try:
        git_service.get_workspace_path(workspace_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if payload.no_cache:
        check_confirmation(confirm, "force-rebuild", x_confirm_action)

    task_id = get_task_manager().enqueue(
        db,
        task_type="image.git.build",
        params={"workspace_id": workspace_id, **payload.model_dump(mode="json")},
        created_by=user.username,
        resource_type="image",
        resource_id=payload.tag,
    )
    write_audit_log(
        db,
        action="image.git.build",
        resource_type="image",
        resource_id=payload.tag,
        user=user,
        detail={"task_id": task_id, "workspace_id": workspace_id},
    )
    return {"task_id": task_id}


@router.get("/git/workspace/{workspace_id}/env")
def get_workspace_env(
    workspace_id: str,
    template_path: str | None = Query(default=None),
    _: User = Depends(get_current_admin),
) -> dict:
    service = GitService()
    try:
        env_templates = service.discover_env_templates(workspace_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    selected = template_path if template_path and template_path in env_templates else (env_templates[0] if env_templates else None)

    if selected is None:
        return {
            "workspace_id": workspace_id,
            "env_templates": [],
            "selected_template": None,
            "target_path": None,
            "custom_exists": False,
            "template_content": "",
            "template_variables": [],
            "custom_content": "",
            "custom_variables": [],
        }

    try:
        info = service.read_env_template(workspace_id, selected)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "workspace_id": workspace_id,
        "env_templates": env_templates,
        "selected_template": selected,
        **info,
    }


@router.put("/git/workspace/{workspace_id}/env")
def update_workspace_env(
    workspace_id: str,
    payload: WorkspaceEnvUpdateRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = GitService()
    try:
        result = service.save_env_file(workspace_id, payload.template_path, payload.content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    write_audit_log(
        db,
        action="image.git.env.update",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={"template_path": payload.template_path},
    )
    return result


@router.delete("/git/workspace/{workspace_id}/env")
def clear_workspace_env(
    workspace_id: str,
    template_path: str = Query(),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    service = GitService()
    try:
        result = service.clear_env_file(workspace_id, template_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    write_audit_log(
        db,
        action="image.git.env.clear",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={"template_path": template_path, "deleted": result["deleted"]},
    )
    return result


@router.delete("/git/workspace/{workspace_id}")
def delete_workspace(
    workspace_id: str,
    confirm: bool = Query(default=False),
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    check_confirmation(confirm, "remove-workspace", x_confirm_action)

    git_service = GitService()
    try:
        git_service.cleanup(workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    write_audit_log(
        db,
        action="image.git.workspace.cleanup",
        resource_type="image",
        resource_id=workspace_id,
        user=user,
        detail={},
    )
    return {"deleted": workspace_id}


# ---------------------------------------------------------------------------
# Load image from remote URL (e.g. GitHub/Gitee release asset tar)
# ---------------------------------------------------------------------------


@router.post("/load-url")
def load_image_from_url(
    payload: LoadFromUrlRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    task_id = get_task_manager().enqueue(
        db,
        task_type="image.load.url",
        params=payload.model_dump(mode="json"),
        created_by=user.username,
        resource_type="image",
        resource_id=payload.url,
    )
    write_audit_log(
        db,
        action="image.load.url",
        resource_type="image",
        resource_id=payload.url,
        user=user,
        detail={"task_id": task_id},
    )
    return {"task_id": task_id}


# ---------------------------------------------------------------------------
# Wildcard image delete — must be defined LAST to avoid capturing specific
# sub-paths like /git/workspace/... above.
# ---------------------------------------------------------------------------


@router.delete("/{image_ref:path}")
def delete_image(
    image_ref: str,
    force: bool = Query(default=False),
    noprune: bool = Query(default=False),
    confirm: bool = Query(default=False),
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    check_confirmation(confirm, "remove-image", x_confirm_action)

    service = DockerService()
    result = service.remove_image(image_ref, force=force, noprune=noprune)
    write_audit_log(
        db,
        action="image.remove",
        resource_type="image",
        resource_id=image_ref,
        user=user,
        detail={"force": force, "noprune": noprune},
    )
    return {"deleted": result}
