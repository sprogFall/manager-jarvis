from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from app.core.config import get_settings
from app.services.proxy_service import build_proxy_env

settings = get_settings()
COMPOSE_FILE_SUFFIXES = {".yaml", ".yml"}
IGNORED_WORKSPACE_DIRS = {".git", ".jarvis"}
PROJECT_NAME_SAFE_RE = re.compile(r"[^a-z0-9_-]+")
GIT_MISSING_MESSAGE = "git command not found in runtime image"


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
        except FileNotFoundError as exc:
            shutil.rmtree(workspace_path, ignore_errors=True)
            if exc.filename == "git":
                raise RuntimeError(GIT_MISSING_MESSAGE) from exc
            raise
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
                dockerfiles.append(rel.as_posix())
        directories = sorted(
            item.name for item in workspace_path.iterdir() if item.is_dir() and item.name != ".git"
        )
        compose_files = self._discover_compose_files(workspace_path)
        return {
            "workspace_id": workspace_id,
            "dockerfiles": dockerfiles,
            "directories": directories,
            "compose_files": compose_files,
        }

    def cleanup(self, workspace_id: str) -> None:
        _validate_workspace_id(workspace_id)
        shutil.rmtree(settings.workspaces_path / workspace_id, ignore_errors=True)

    def read_workspace_compose(
        self,
        workspace_id: str,
        compose_path: str | None = None,
        source: str = "repository",
    ) -> dict[str, str | bool | list[str]]:
        workspace_path, compose_files, selected_compose, selected_file = self._resolve_compose(
            workspace_id,
            compose_path,
        )
        custom_file = self._override_compose_path(workspace_path, selected_compose)
        custom_exists = custom_file.exists()
        if source == "custom":
            if not custom_exists:
                raise FileNotFoundError("Custom compose not found")
            target = custom_file
        elif source == "repository":
            target = selected_file
        else:
            raise ValueError(f"Unsupported compose source: {source}")
        content = target.read_text(encoding="utf-8")
        return {
            "workspace_id": workspace_id,
            "compose_files": compose_files,
            "selected_compose": selected_compose,
            "source": source,
            "custom_exists": custom_exists,
            "project_name": self.suggest_project_name(workspace_id, selected_compose),
            "content": content,
        }

    def save_workspace_compose_override(
        self,
        workspace_id: str,
        content: str,
        compose_path: str | None = None,
    ) -> dict[str, str]:
        workspace_path, _, selected_compose, _ = self._resolve_compose(workspace_id, compose_path)
        target = self._override_compose_path(workspace_path, selected_compose)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {
            "workspace_id": workspace_id,
            "compose_path": selected_compose,
            "custom_compose_path": target.relative_to(workspace_path).as_posix(),
        }

    def clear_workspace_compose_override(
        self,
        workspace_id: str,
        compose_path: str | None = None,
    ) -> dict[str, str | bool]:
        workspace_path, _, selected_compose, _ = self._resolve_compose(workspace_id, compose_path)
        target = self._override_compose_path(workspace_path, selected_compose)
        existed = target.exists()
        target.unlink(missing_ok=True)
        return {
            "workspace_id": workspace_id,
            "compose_path": selected_compose,
            "deleted": existed,
        }

    def resolve_workspace_compose_target(
        self,
        workspace_id: str,
        compose_path: str | None = None,
        source: str = "custom",
    ) -> dict[str, str]:
        workspace_path, _, selected_compose, selected_file = self._resolve_compose(workspace_id, compose_path)
        custom_file = self._override_compose_path(workspace_path, selected_compose)

        if source == "custom":
            if not custom_file.exists():
                raise FileNotFoundError("Custom compose not found")
            compose_file = custom_file
        elif source == "repository":
            compose_file = selected_file
        else:
            raise ValueError(f"Unsupported compose source: {source}")

        return {
            "workspace_id": workspace_id,
            "compose_path": selected_compose,
            "compose_file": str(compose_file.resolve()),
            "project_directory": str(selected_file.parent.resolve()),
            "source": source,
        }

    def suggest_project_name(self, workspace_id: str, compose_path: str) -> str:
        base = Path(compose_path).parent.name or Path(compose_path).stem or "app"
        cleaned = PROJECT_NAME_SAFE_RE.sub("-", base.lower()).strip("-")
        if not cleaned:
            cleaned = "app"
        return f"ws-{workspace_id[:8]}-{cleaned}"[:50]

    def sync_workspace(self, workspace_id: str, proxy_url: str | None = None) -> dict[str, str]:
        workspace_path = self.get_workspace_path(workspace_id)
        env = build_proxy_env({**os.environ, "GIT_TERMINAL_PROMPT": "0"}, proxy_url)

        try:
            pull_proc = subprocess.run(
                ["git", "-C", str(workspace_path), "pull", "--ff-only"],
                check=True,
                capture_output=True,
                text=True,
                timeout=300,
                env=env,
            )
        except FileNotFoundError as exc:
            if exc.filename == "git":
                raise RuntimeError(GIT_MISSING_MESSAGE) from exc
            raise
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"git pull failed: {exc.stderr.strip()}") from exc
        except subprocess.TimeoutExpired:
            raise RuntimeError("git pull timed out after 5 minutes") from None

        try:
            branch_proc = subprocess.run(
                ["git", "-C", str(workspace_path), "rev-parse", "--abbrev-ref", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
                env=env,
            )
            commit_proc = subprocess.run(
                ["git", "-C", str(workspace_path), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
                env=env,
            )
        except FileNotFoundError as exc:
            if exc.filename == "git":
                raise RuntimeError(GIT_MISSING_MESSAGE) from exc
            raise
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"git rev-parse failed: {exc.stderr.strip()}") from exc
        except subprocess.TimeoutExpired:
            raise RuntimeError("git rev-parse timed out after 1 minute") from None
        return {
            "workspace_id": workspace_id,
            "branch": branch_proc.stdout.strip(),
            "commit": commit_proc.stdout.strip(),
            "output": pull_proc.stdout.strip() or pull_proc.stderr.strip() or "Already up to date.",
        }

    def _resolve_compose(
        self,
        workspace_id: str,
        compose_path: str | None,
    ) -> tuple[Path, list[str], str, Path]:
        workspace_path = self.get_workspace_path(workspace_id)
        compose_files = self._discover_compose_files(workspace_path)
        if compose_path:
            selected_file = self._resolve_workspace_file(workspace_path, compose_path)
            if not selected_file.exists() or not selected_file.is_file():
                raise FileNotFoundError(f"Compose file not found: {compose_path}")
            if selected_file.suffix.lower() not in COMPOSE_FILE_SUFFIXES:
                raise ValueError("compose_path must end with .yml or .yaml")
            selected_compose = selected_file.relative_to(workspace_path).as_posix()
            if selected_compose not in compose_files:
                compose_files = self._sort_workspace_paths([*compose_files, selected_compose])
            return workspace_path, compose_files, selected_compose, selected_file

        if not compose_files:
            raise FileNotFoundError("No compose file found in workspace")

        selected_compose = compose_files[0]
        selected_file = (workspace_path / selected_compose).resolve()
        return workspace_path, compose_files, selected_compose, selected_file

    def _discover_compose_files(self, workspace_path: Path) -> list[str]:
        matches: set[str] = set()
        for file_path in workspace_path.rglob("*"):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(workspace_path)
            if any(part in IGNORED_WORKSPACE_DIRS for part in rel.parts):
                continue
            suffix = file_path.suffix.lower()
            name = file_path.name.lower()
            if suffix not in COMPOSE_FILE_SUFFIXES:
                continue
            if "compose" not in name:
                continue
            matches.add(rel.as_posix())
        return self._sort_workspace_paths(matches)

    def _resolve_workspace_file(self, workspace_path: Path, relative_path: str) -> Path:
        clean = (relative_path or "").strip()
        if not clean:
            raise ValueError("compose_path is required")
        path = Path(clean)
        if path.is_absolute():
            raise ValueError("compose_path must be relative path")
        target = (workspace_path / path).resolve()
        if workspace_path not in target.parents and target != workspace_path:
            raise ValueError("compose_path escapes workspace")
        rel = target.relative_to(workspace_path)
        if any(part in IGNORED_WORKSPACE_DIRS for part in rel.parts):
            raise ValueError("compose_path points to reserved directory")
        return target

    def _override_compose_path(self, workspace_path: Path, compose_path: str) -> Path:
        digest = hashlib.sha1(compose_path.encode("utf-8")).hexdigest()[:16]
        suffix = Path(compose_path).suffix.lower()
        if suffix not in COMPOSE_FILE_SUFFIXES:
            suffix = ".yaml"
        return workspace_path / ".jarvis" / "compose-overrides" / f"{digest}{suffix}"

    def _sort_workspace_paths(self, paths: list[str] | set[str]) -> list[str]:
        return sorted(set(paths), key=lambda item: (item.count("/"), item))


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
