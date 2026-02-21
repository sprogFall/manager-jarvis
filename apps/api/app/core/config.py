from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Manager Jarvis API"
    api_v1_prefix: str = "/api/v1"

    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_minutes: int = Field(default=10080, alias="REFRESH_TOKEN_EXPIRE_MINUTES")

    database_url: str = Field(default="sqlite:///./jarvis.db", alias="DATABASE_URL")

    admin_username: str = Field(default="admin", alias="ADMIN_USERNAME")
    admin_password: str = Field(default="admin123456", alias="ADMIN_PASSWORD")

    docker_base_url: str = Field(default="unix:///var/run/docker.sock", alias="DOCKER_BASE_URL")

    stacks_dir: str = Field(default="./data/stacks", alias="STACKS_DIR")
    upload_dir: str = Field(default="./data/uploads", alias="UPLOAD_DIR")
    export_dir: str = Field(default="./data/exports", alias="EXPORT_DIR")
    workspaces_dir: str = Field(default="./data/workspaces", alias="WORKSPACES_DIR")
    task_log_dir: str = Field(default="./data/task-logs", alias="TASK_LOG_DIR")
    max_upload_size_mb: int = Field(default=2048, alias="MAX_UPLOAD_SIZE_MB")
    enable_web_terminal: bool = Field(default=True, alias="ENABLE_WEB_TERMINAL")
    frontend_dist_dir: str = Field(default="", alias="FRONTEND_DIST_DIR")

    @property
    def stacks_path(self) -> Path:
        return Path(self.stacks_dir).resolve()

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir).resolve()

    @property
    def export_path(self) -> Path:
        return Path(self.export_dir).resolve()

    @property
    def workspaces_path(self) -> Path:
        return Path(self.workspaces_dir).resolve()

    @property
    def task_logs_path(self) -> Path:
        return Path(self.task_log_dir).resolve()

    @property
    def frontend_dist_path(self) -> Path | None:
        if not self.frontend_dist_dir:
            return None
        path = Path(self.frontend_dist_dir).resolve()
        if not path.is_dir():
            return None
        return path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
