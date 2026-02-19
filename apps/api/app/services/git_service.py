from __future__ import annotations

import os
import shutil
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from app.core.config import get_settings
from app.services.proxy_service import build_proxy_env

settings = get_settings()


class GitService:
    def clone(
        self,
        repo_url: str,
        branch: str | None = None,
        token: str | None = None,
        proxy_url: str | None = None,
    ) -> tuple[str, Path]:
        """Clone a git repo into a new workspace. Returns (workspace_id, workspace_path)."""
        workspace_id = uuid.uuid4().hex
        workspace_path = settings.workspaces_path / workspace_id
        workspace_path.mkdir(parents=True, exist_ok=True)

        clone_url = _inject_token(repo_url, token) if token else repo_url
        cmd = ["git", "clone", "--depth", "1"]
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([clone_url, str(workspace_path)])

        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        env = build_proxy_env(env, proxy_url)
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=300, env=env)
        except subprocess.CalledProcessError as exc:
            shutil.rmtree(workspace_path, ignore_errors=True)
            stderr = exc.stderr.decode("utf-8", errors="replace")
            if token:
                stderr = stderr.replace(token, "***")
            raise RuntimeError(f"git clone failed: {stderr}") from exc
        except subprocess.TimeoutExpired:
            shutil.rmtree(workspace_path, ignore_errors=True)
            raise RuntimeError("git clone timed out after 5 minutes") from None

        return workspace_id, workspace_path

    def get_workspace_path(self, workspace_id: str) -> Path:
        _validate_workspace_id(workspace_id)
        path = settings.workspaces_path / workspace_id
        if not path.exists():
            raise FileNotFoundError(f"Workspace {workspace_id} not found")
        return path

    def list_workspace(self, workspace_id: str) -> dict:
        workspace_path = self.get_workspace_path(workspace_id)
        dockerfiles: list[str] = []
        for df in sorted(workspace_path.rglob("Dockerfile*")):
            rel = df.relative_to(workspace_path)
            if ".git" not in rel.parts:
                dockerfiles.append(str(rel))
        directories = sorted(
            item.name for item in workspace_path.iterdir() if item.is_dir() and item.name != ".git"
        )
        return {
            "workspace_id": workspace_id,
            "dockerfiles": dockerfiles,
            "directories": directories,
        }

    def cleanup(self, workspace_id: str) -> None:
        _validate_workspace_id(workspace_id)
        shutil.rmtree(settings.workspaces_path / workspace_id, ignore_errors=True)


def _validate_workspace_id(workspace_id: str) -> None:
    if not workspace_id.isalnum() or len(workspace_id) != 32:
        raise ValueError(f"Invalid workspace_id: {workspace_id!r}")


def _inject_token(url: str, token: str) -> str:
    """Embed a personal access token into an HTTPS git URL."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    port_part = f":{parsed.port}" if parsed.port else ""
    netloc = f"x-token:{token}@{host}{port_part}"
    return urlunparse(parsed._replace(netloc=netloc))
