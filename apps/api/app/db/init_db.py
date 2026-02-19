from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import engine
from app.models import AuditLog, TaskRecord, User  # noqa: F401

settings = get_settings()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_admin_user(db: Session) -> None:
    existing = db.scalar(select(User).where(User.username == settings.admin_username))
    if existing:
        return

    admin = User(
        username=settings.admin_username,
        password_hash=get_password_hash(settings.admin_password),
        is_active=True,
        is_admin=True,
    )
    db.add(admin)
    db.commit()
