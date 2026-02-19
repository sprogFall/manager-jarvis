from fastapi import APIRouter

from app.api.v1 import audit_logs, auth, containers, images, stacks, system, tasks

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(containers.router)
api_router.include_router(images.router)
api_router.include_router(stacks.router)
api_router.include_router(tasks.router)
api_router.include_router(audit_logs.router)
api_router.include_router(system.router)
