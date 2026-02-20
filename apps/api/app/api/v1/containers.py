from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.audit import write_audit_log
from app.core.deps import get_current_admin
from app.core.security import TokenError, decode_token
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.schemas.container import (
    BatchStopRequest,
    ContainerActionResponse,
    ContainerDetail,
    ContainerSummary,
    CreateContainerRequest,
    ExecRequest,
    ExecResponse,
)
from app.services.docker_service import DockerService
from app.services.task_service import get_task_manager
from app.utils.confirm import check_confirmation, confirmation_header

router = APIRouter(prefix="/containers", tags=["containers"])
settings = get_settings()


@router.get("", response_model=list[ContainerSummary])
def list_containers(
    all_containers: bool = True,
    include_stats: bool = False,
    _: User = Depends(get_current_admin),
) -> list[ContainerSummary]:
    service = DockerService()
    return [ContainerSummary.model_validate(item) for item in service.list_containers(all_containers, include_stats)]


@router.get("/{container_id}", response_model=ContainerDetail)
def container_detail(container_id: str, _: User = Depends(get_current_admin)) -> ContainerDetail:
    service = DockerService()
    return ContainerDetail.model_validate(service.get_container_detail(container_id))


@router.post("", response_model=ContainerActionResponse)
def create_container(
    payload: CreateContainerRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ContainerActionResponse:
    service = DockerService()
    container_id = service.create_container(payload.model_dump())
    write_audit_log(
        db,
        action="container.create",
        resource_type="container",
        resource_id=container_id,
        user=user,
        detail={"image": payload.image, "name": payload.name},
    )
    return ContainerActionResponse(id=container_id, action="create")


@router.post("/batch-stop")
def batch_stop(
    payload: BatchStopRequest,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    check_confirmation(payload.confirm, "batch-stop", x_confirm_action)
    service = DockerService()
    result = service.batch_stop(payload.container_ids)
    write_audit_log(
        db,
        action="container.batch_stop",
        resource_type="container",
        resource_id=",".join(payload.container_ids),
        user=user,
        detail=result,
    )
    return result


def _run_container_action(
    container_id: str,
    action: str,
    x_confirm_action: str | None,
    user: User,
    db: Session,
    confirm: bool = False,
) -> ContainerActionResponse:
    if action == "kill":
        check_confirmation(confirm, "kill", x_confirm_action)

    service = DockerService()
    service.container_action(container_id, action)
    write_audit_log(
        db,
        action=f"container.{action}",
        resource_type="container",
        resource_id=container_id,
        user=user,
    )
    return ContainerActionResponse(id=container_id, action=action)


@router.post("/{container_id}/start", response_model=ContainerActionResponse)
def start_container(
    container_id: str,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ContainerActionResponse:
    return _run_container_action(container_id, "start", x_confirm_action, user, db)


@router.post("/{container_id}/stop", response_model=ContainerActionResponse)
def stop_container(
    container_id: str,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ContainerActionResponse:
    return _run_container_action(container_id, "stop", x_confirm_action, user, db)


@router.post("/{container_id}/restart", response_model=ContainerActionResponse)
def restart_container(
    container_id: str,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ContainerActionResponse:
    return _run_container_action(container_id, "restart", x_confirm_action, user, db)


@router.post("/{container_id}/kill", response_model=ContainerActionResponse)
def kill_container(
    container_id: str,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    confirm: bool = False,
) -> ContainerActionResponse:
    return _run_container_action(container_id, "kill", x_confirm_action, user, db, confirm=confirm)


@router.delete("/{container_id}", response_model=ContainerActionResponse)
def remove_container(
    container_id: str,
    force: bool = False,
    confirm: bool = False,
    x_confirm_action: str | None = Depends(confirmation_header),
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ContainerActionResponse:
    check_confirmation(confirm, "remove-container", x_confirm_action)

    service = DockerService()
    service.remove_container(container_id, force=force)
    write_audit_log(
        db,
        action="container.remove",
        resource_type="container",
        resource_id=container_id,
        user=user,
        detail={"force": force},
    )
    return ContainerActionResponse(id=container_id, action="remove")


@router.get("/{container_id}/logs")
def container_logs(
    container_id: str,
    follow: bool = Query(default=False),
    tail: int = Query(default=500, ge=1, le=10000),
    since: str | None = None,
    until: str | None = None,
    search: str | None = None,
    _: User = Depends(get_current_admin),
):
    service = DockerService()
    if follow:
        generator = service.stream_logs_sse(container_id, tail=tail, since=since, until=until, search=search)
        return StreamingResponse(generator, media_type="text/event-stream")

    logs = service.get_logs_text(container_id, tail=tail, since=since, until=until, search=search)
    return PlainTextResponse(content=logs)


@router.post("/{container_id}/logs/export")
def export_logs(
    container_id: str,
    tail: int = Query(default=1000, ge=1, le=100000),
    since: str | None = None,
    until: str | None = None,
    search: str | None = None,
    filename: str | None = None,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    task_manager = get_task_manager()
    final_filename = (filename or f"{container_id[:12]}_logs.txt").strip()
    final_filename = final_filename if final_filename else f"{container_id[:12]}_logs.txt"
    final_filename = final_filename.replace("\\", "/").split("/")[-1]
    task_id = task_manager.enqueue(
        db,
        task_type="container.logs.export",
        params={
            "container_id": container_id,
            "tail": tail,
            "since": since,
            "until": until,
            "search": search,
            "filename": final_filename,
        },
        created_by=user.username,
        resource_type="container",
        resource_id=container_id,
    )
    write_audit_log(
        db,
        action="container.logs.export",
        resource_type="container",
        resource_id=container_id,
        user=user,
        detail={"task_id": task_id},
    )
    return {"task_id": task_id}


@router.post("/{container_id}/exec", response_model=ExecResponse)
def container_exec(
    container_id: str,
    payload: ExecRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ExecResponse:
    service = DockerService()
    result = service.exec_in_container(
        container_id,
        cmd=payload.cmd,
        user=payload.user,
        workdir=payload.workdir,
        tty=payload.tty,
        privileged=payload.privileged,
    )
    write_audit_log(
        db,
        action="container.exec",
        resource_type="container",
        resource_id=container_id,
        user=user,
        detail={"cmd": payload.cmd, "exit_code": result.get("exit_code")},
    )
    return ExecResponse.model_validate(result)


@router.websocket("/{container_id}/terminal/ws")
async def terminal_ws(websocket: WebSocket, container_id: str, token: str) -> None:
    if not settings.enable_web_terminal:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Web terminal disabled")
        return

    try:
        payload = decode_token(token, expected_type="access")
    except TokenError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    username = payload.get("sub")
    if not username:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token payload")
        return

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.username == username))
        if not user or not user.is_admin or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Forbidden")
            return

        await websocket.accept()
        await websocket.send_json(
            {
                "type": "ready",
                "message": "Send shell command line text. Input 'exit' to close session.",
                "container_id": container_id,
            }
        )
        service = DockerService()
        while True:
            command = await websocket.receive_text()
            if command.strip().lower() in {"exit", "quit"}:
                await websocket.send_json({"type": "bye"})
                await websocket.close()
                return

            result = await run_in_threadpool(
                service.exec_in_container,
                container_id,
                ["/bin/sh", "-lc", command],
                None,
                None,
                False,
                False,
            )
            await websocket.send_json({"type": "result", "command": command, **result})
    except WebSocketDisconnect:
        return
    finally:
        db.close()
