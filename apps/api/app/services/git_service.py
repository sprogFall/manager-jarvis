from __future__ import annotations

import hashlib
import json
import os
import re
import selectors
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse, urlunparse

import yaml

from app.core.config import get_settings
from app.services.proxy_service import build_proxy_env

settings = get_settings()
COMPOSE_FILE_SUFFIXES = {".yaml", ".yml"}
IGNORED_WORKSPACE_DIRS = {".git", ".jarvis"}
ENV_TEMPLATE_SUFFIXES = (".example", ".sample", ".template")
PROJECT_NAME_SAFE_RE = re.compile(r"[^a-z0-9_-]+")
GIT_MISSING_MESSAGE = "git command not found in runtime image"


class GitService:
    def list_workspaces(self) -> list[dict]:
        settings.workspaces_path.mkdir(parents=True, exist_ok=True)
        items: list[dict] = []
        for child in settings.workspaces_path.iterdir():
            if not child.is_dir():
                continue
            workspace_id = child.name
            try:
                _validate_workspace_id(workspace_id)
            except ValueError:
                continue

            meta = self._read_workspace_meta(child)
            updated_at = datetime.fromtimestamp(child.stat().st_mtime, tz=timezone.utc).isoformat()
            compose_files = self._discover_compose_files(child)
            items.append(
                {
                    "workspace_id": workspace_id,
                    "repo_url": meta.get("repo_url"),
                    "branch": meta.get("branch"),
                    "created_at": meta.get("created_at"),
                    "updated_at": updated_at,
                    "compose_files_count": len(compose_files),
                }
            )

        items.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return items

    def clone(
        self,
        repo_url: str,
        branch: str | None = None,
        token: str | None = None,
        proxy_url: str | None = None,
        *,
        log_writer: Callable[[str], None] | None = None,
    ) -> tuple[str, Path]:
        """Clone a git repo into a new workspace. Returns (workspace_id, workspace_path)."""
        workspace_id = uuid.uuid4().hex
        workspace_path = settings.workspaces_path / workspace_id
        workspace_path.mkdir(parents=True, exist_ok=True)

        clone_url = _inject_token(repo_url, token) if token else repo_url
        cmd = ["git", "clone", "--depth", "1"]
        if branch:
            cmd.extend(["--branch", branch])
        if log_writer:
            cmd.append("--progress")
        cmd.extend([clone_url, str(workspace_path)])

        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        env = build_proxy_env(env, proxy_url)
        try:
            if log_writer:
                display_cmd = ["git", "clone", "--depth", "1"]
                if branch:
                    display_cmd.extend(["--branch", branch])
                display_cmd.append("--progress")
                display_cmd.extend([repo_url, str(workspace_path)])
                log_writer(f"$ {' '.join(display_cmd)}")

                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=False,
                    env=env,
                )
                assert proc.stdout is not None
                sel = selectors.DefaultSelector()
                sel.register(proc.stdout, selectors.EVENT_READ)
                started = time.monotonic()
                buffer = b""
                captured: list[str] = []
                try:
                    while True:
                        if time.monotonic() - started > 300:
                            proc.kill()
                            raise subprocess.TimeoutExpired(cmd=" ".join(display_cmd), timeout=300)

                        events = sel.select(timeout=0.25)
                        if events:
                            chunk = proc.stdout.read(4096)
                            if not chunk:
                                if proc.poll() is not None:
                                    break
                                continue
                            buffer += chunk
                            while True:
                                idx_n = buffer.find(b"\n")
                                idx_r = buffer.find(b"\r")
                                if idx_n == -1 and idx_r == -1:
                                    break
                                candidates = [i for i in (idx_n, idx_r) if i != -1]
                                idx = min(candidates)
                                line_bytes = buffer[:idx]
                                buffer = buffer[idx + 1 :]
                                text = line_bytes.decode("utf-8", errors="replace")
                                if token:
                                    text = text.replace(token, "***")
                                log_writer(text)
                                captured.append(text)
                                if len(captured) > 80:
                                    del captured[:-80]
                        else:
                            if proc.poll() is not None:
                                break

                    rest = proc.stdout.read()
                    if rest:
                        buffer += rest
                    if buffer:
                        text = buffer.decode("utf-8", errors="replace")
                        if token:
                            text = text.replace(token, "***")
                        for item in text.splitlines():
                            log_writer(item)
                            captured.append(item)
                            if len(captured) > 80:
                                del captured[:-80]
                finally:
                    sel.close()

                exit_code = proc.wait()
                if exit_code != 0:
                    shutil.rmtree(workspace_path, ignore_errors=True)
                    message = "\n".join(captured[-20:]) or "git clone failed"
                    raise RuntimeError(f"git clone failed: {message}")
            else:
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

    def write_workspace_meta(self, workspace_id: str, *, repo_url: str, branch: str | None = None) -> None:
        workspace_path = self.get_workspace_path(workspace_id)
        meta_path = workspace_path / ".jarvis" / "workspace.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        existing = self._read_workspace_meta(workspace_path)
        existing.update({
            "workspace_id": workspace_id,
            "repo_url": repo_url,
            "branch": branch,
            "created_at": existing.get("created_at", datetime.now(timezone.utc).isoformat()),
        })
        meta_path.write_text(
            json.dumps(existing, ensure_ascii=False),
            encoding="utf-8",
        )

    def save_workspace_project_name(
        self, workspace_id: str, compose_path: str | None, project_name: str
    ) -> dict[str, str]:
        workspace_path = self.get_workspace_path(workspace_id)
        meta_path = workspace_path / ".jarvis" / "workspace.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta = self._read_workspace_meta(workspace_path)
        project_names: dict[str, str] = meta.get("project_names", {})
        if not isinstance(project_names, dict):
            project_names = {}
        key = compose_path or "__default__"
        project_names[key] = project_name
        meta["project_names"] = project_names
        meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        return {
            "workspace_id": workspace_id,
            "compose_path": key,
            "project_name": project_name,
        }

    def _read_workspace_meta(self, workspace_path: Path) -> dict:
        meta_path = workspace_path / ".jarvis" / "workspace.json"
        if not meta_path.exists() or not meta_path.is_file():
            return {}
        try:
            raw = meta_path.read_text(encoding="utf-8")
        except OSError:
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

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
        meta = self._read_workspace_meta(workspace_path)
        project_names = meta.get("project_names", {})
        saved_name = project_names.get(selected_compose) if isinstance(project_names, dict) else None
        project_name = saved_name or self.suggest_project_name(workspace_id, selected_compose)
        build_services = self.extract_build_services(content)
        return {
            "workspace_id": workspace_id,
            "compose_files": compose_files,
            "selected_compose": selected_compose,
            "source": source,
            "custom_exists": custom_exists,
            "project_name": project_name,
            "content": content,
            "build_services": build_services,
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

    @staticmethod
    def extract_build_services(content: str) -> list[dict]:
        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError:
            return []
        if not isinstance(data, dict):
            return []
        services = data.get("services")
        if not isinstance(services, dict):
            return []
        result: list[dict] = []
        for name, svc in services.items():
            if not isinstance(svc, dict):
                continue
            if "build" in svc:
                result.append({"name": name, "image": svc.get("image")})
        return result

    @staticmethod
    def inject_image_tags(content: str, image_tags: dict[str, str]) -> str:
        data = yaml.safe_load(content)
        if not isinstance(data, dict):
            raise ValueError("Invalid compose content")
        services = data.get("services")
        if not isinstance(services, dict):
            raise ValueError("No services in compose content")
        for svc_name, tag in image_tags.items():
            if svc_name in services and isinstance(services[svc_name], dict):
                services[svc_name]["image"] = tag
        return yaml.dump(data, default_flow_style=False, allow_unicode=True)

    def sync_workspace(
        self,
        workspace_id: str,
        proxy_url: str | None = None,
        *,
        log_writer: Callable[[str], None] | None = None,
    ) -> dict[str, str]:
        workspace_path = self.get_workspace_path(workspace_id)
        env = build_proxy_env({**os.environ, "GIT_TERMINAL_PROMPT": "0"}, proxy_url)

        try:
            pull_cmd = ["git", "-C", str(workspace_path), "pull", "--ff-only"]
            if log_writer:
                log_writer(f"$ {' '.join(pull_cmd)}")
                proc = subprocess.run(
                    pull_cmd,
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=300,
                    env=env,
                )
                if proc.stdout.strip():
                    log_writer(proc.stdout.strip())
                if proc.stderr.strip():
                    log_writer(proc.stderr.strip())
                pull_proc = proc
            else:
                pull_proc = subprocess.run(
                    pull_cmd,
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

    def discover_env_templates(self, workspace_id: str) -> list[str]:
        workspace_path = self.get_workspace_path(workspace_id)
        matches: set[str] = set()
        for file_path in workspace_path.rglob("*"):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(workspace_path)
            if any(part in IGNORED_WORKSPACE_DIRS for part in rel.parts):
                continue
            name = file_path.name
            if not name.startswith(".env."):
                continue
            suffix = name[len(".env") :]  # e.g. ".example"
            if suffix in ENV_TEMPLATE_SUFFIXES:
                matches.add(rel.as_posix())
        return self._sort_workspace_paths(matches)

    @staticmethod
    def _env_target_path(template_path: str) -> str:
        p = Path(template_path)
        stem = p.stem  # ".env" from ".env.example"
        return (p.parent / stem).as_posix() if p.parent != Path(".") else stem

    @staticmethod
    def _parse_env_content(content: str) -> list[dict]:
        result: list[dict] = []
        comment_lines: list[str] = []
        for line in content.splitlines():
            stripped = line.strip()
            if not stripped:
                comment_lines.clear()
                continue
            if stripped.startswith("#"):
                comment_lines.append(stripped.lstrip("# "))
                continue
            if "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            result.append({
                "key": key,
                "value": value,
                "comment": "\n".join(comment_lines),
            })
            comment_lines.clear()
        return result

    def _resolve_file(self, workspace_path: Path, relative_path: str, param_name: str = "path") -> Path:
        clean = (relative_path or "").strip()
        if not clean:
            raise ValueError(f"{param_name} is required")
        path = Path(clean)
        if path.is_absolute():
            raise ValueError(f"{param_name} must be relative path")
        target = (workspace_path / path).resolve()
        if workspace_path not in target.parents and target != workspace_path:
            raise ValueError(f"{param_name} escapes workspace")
        rel = target.relative_to(workspace_path)
        if any(part in IGNORED_WORKSPACE_DIRS for part in rel.parts):
            raise ValueError(f"{param_name} points to reserved directory")
        return target

    def read_env_template(self, workspace_id: str, template_path: str) -> dict:
        workspace_path = self.get_workspace_path(workspace_id)
        template_file = self._resolve_file(workspace_path, template_path, "template_path")
        if not template_file.exists() or not template_file.is_file():
            raise FileNotFoundError(f"Template not found: {template_path}")
        template_content = template_file.read_text(encoding="utf-8")
        template_variables = self._parse_env_content(template_content)

        target_rel = self._env_target_path(template_path)
        target_file = self._resolve_file(workspace_path, target_rel, "target_path")
        custom_exists = target_file.exists() and target_file.is_file()
        custom_content = ""
        custom_variables: list[dict] = []
        if custom_exists:
            custom_content = target_file.read_text(encoding="utf-8")
            custom_variables = self._parse_env_content(custom_content)

        return {
            "template_path": template_path,
            "target_path": target_rel,
            "custom_exists": custom_exists,
            "template_content": template_content,
            "template_variables": template_variables,
            "custom_content": custom_content,
            "custom_variables": custom_variables,
        }

    def save_env_file(self, workspace_id: str, template_path: str, content: str) -> dict:
        workspace_path = self.get_workspace_path(workspace_id)
        self._resolve_file(workspace_path, template_path, "template_path")
        target_rel = self._env_target_path(template_path)
        target_file = self._resolve_file(workspace_path, target_rel, "target_path")
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text(content, encoding="utf-8")
        return {
            "workspace_id": workspace_id,
            "template_path": template_path,
            "target_path": target_rel,
        }

    def clear_env_file(self, workspace_id: str, template_path: str) -> dict:
        workspace_path = self.get_workspace_path(workspace_id)
        self._resolve_file(workspace_path, template_path, "template_path")
        target_rel = self._env_target_path(template_path)
        target_file = self._resolve_file(workspace_path, target_rel, "target_path")
        existed = target_file.exists()
        target_file.unlink(missing_ok=True)
        return {
            "workspace_id": workspace_id,
            "template_path": template_path,
            "target_path": target_rel,
            "deleted": existed,
        }


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
