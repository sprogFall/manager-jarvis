from pydantic import BaseModel


class ProxyConfigRequest(BaseModel):
    proxy_url: str | None = None


class ProxyConfigResponse(BaseModel):
    proxy_url: str | None = None
