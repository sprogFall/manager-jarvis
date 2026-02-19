from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.system_setting import SystemSetting

_PROXY_KEY = "network.proxy_url"
_ALLOWED_SCHEMES = {"http", "https", "socks5", "socks5h"}


def normalize_proxy_url(proxy_url: str | None) -> str | None:
    if proxy_url is None:
        return None

    value = proxy_url.strip()
    if not value:
        return None

    candidate = value if "://" in value else f"http://{value}"
    parsed = urlparse(candidate)
    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"Unsupported proxy scheme: {parsed.scheme}")
    if not parsed.hostname:
        raise ValueError("Proxy URL must include hostname")

    normalized = urlunparse((scheme, parsed.netloc, "", "", "", ""))
    return normalized


def build_proxy_env(base_env: dict[str, str], proxy_url: str | None) -> dict[str, str]:
    env = {**base_env}
    if not proxy_url:
        return env

    env["HTTP_PROXY"] = proxy_url
    env["HTTPS_PROXY"] = proxy_url
    env["http_proxy"] = proxy_url
    env["https_proxy"] = proxy_url
    env["ALL_PROXY"] = proxy_url
    env["all_proxy"] = proxy_url
    return env


class ProxyService:
    def get_proxy_url(self, db: Session) -> str | None:
        record = db.scalar(select(SystemSetting).where(SystemSetting.key == _PROXY_KEY))
        return record.value if record else None

    def set_proxy_url(self, db: Session, proxy_url: str | None) -> str | None:
        normalized = normalize_proxy_url(proxy_url)
        record = db.scalar(select(SystemSetting).where(SystemSetting.key == _PROXY_KEY))

        if normalized is None:
            if record:
                db.delete(record)
                db.commit()
            return None

        if record:
            record.value = normalized
        else:
            db.add(SystemSetting(key=_PROXY_KEY, value=normalized))
        db.commit()
        return normalized


def get_runtime_proxy_url() -> str | None:
    db = SessionLocal()
    try:
        return ProxyService().get_proxy_url(db)
    finally:
        db.close()
