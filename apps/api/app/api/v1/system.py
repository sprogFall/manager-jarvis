from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.system import ProxyConfigRequest, ProxyConfigResponse
from app.services.proxy_service import ProxyService

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/proxy", response_model=ProxyConfigResponse)
def get_proxy_config(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ProxyConfigResponse:
    proxy_url = ProxyService().get_proxy_url(db)
    return ProxyConfigResponse(proxy_url=proxy_url)


@router.put("/proxy", response_model=ProxyConfigResponse)
def update_proxy_config(
    payload: ProxyConfigRequest,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ProxyConfigResponse:
    service = ProxyService()
    try:
        proxy_url = service.set_proxy_url(db, payload.proxy_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    write_audit_log(
        db,
        action="system.proxy.update",
        resource_type="system",
        resource_id="network.proxy",
        user=user,
        detail={"proxy_url": proxy_url},
    )
    return ProxyConfigResponse(proxy_url=proxy_url)
