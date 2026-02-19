from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.config import get_settings
from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.image import BuildImageRequest, ImageSummary, PullImageRequest, SaveImageRequest
from app.services.docker_service import DockerService
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
