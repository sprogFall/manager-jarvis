from __future__ import annotations

import json
import logging
import re
import selectors
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
STACK_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


@dataclass
class StackInfo:
    name: str
    path: Path
    compose_file: Path


class StackService:
    def __init__(self) -> None:
        settings.stacks_path.mkdir(parents=True, exist_ok=True)

    def list_stacks(self) -> list[dict[str, Any]]:
        stacks: list[dict[str, Any]] = []
        seen_names: set[str] = set()
        scanned = self._scan_stacks()
        logger.info("stacks_path=%s, scanned=%d stacks", settings.stacks_path, len(scanned))
        for stack in scanned:
            seen_names.add(stack.name)
            stacks.append(
                {
                    "name": stack.name,
                    "path": str(stack.path),
                    "compose_file": str(stack.compose_file),
                    "services": self._get_services(stack),
                }
            )
        discovered = self._discover_projects()
        logger.info("discovered=%d running projects", len(discovered))
        for project in discovered:
            if project.name not in seen_names:
                seen_names.add(project.name)
                stacks.append(
                    {
                        "name": project.name,
                        "path": str(project.path),
                        "compose_file": str(project.compose_file),
                        "services": self._get_services(project),
                    }
                )
        logger.info("total stacks returned=%d", len(stacks))
        return stacks

    def get_stack(self, name: str) -> dict[str, Any]:
        stack = self._resolve_stack(name)
        try:
            content = stack.compose_file.read_text(encoding="utf-8")
        except (FileNotFoundError, OSError) as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Compose file not readable: {exc}",
            ) from exc
        return {
            "name": stack.name,
            "compose_file": str(stack.compose_file),
            "content": content,
            "services": self.stack_services(name),
        }

    def update_compose(self, name: str, content: str) -> dict[str, Any]:
        stack = self._resolve_stack(name)
        stack.compose_file.write_text(content, encoding="utf-8")
        return {"name": name, "compose_file": str(stack.compose_file)}

    def run_action(
        self,
        name: str,
        action: str,
        force_recreate: bool = False,
        *,
        log_writer: Callable[[str], None] | None = None,
        env: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        stack = self._resolve_stack(name)
        base_cmd = ["docker", "compose", "-f", str(stack.compose_file), "-p", name]
        cmd = self._build_action_command(base_cmd, action, force_recreate)
        cwd = stack.compose_file.parent
        result = self._run_command_stream(cmd, log_writer=log_writer, env=env, cwd=cwd) if log_writer else self._run_command(cmd, env=env, cwd=cwd)
        return {"stack": name, "action": action, **result}

    def run_compose_action(
        self,
        *,
        project_name: str,
        compose_file: Path,
        action: str,
        force_recreate: bool = False,
        project_directory: Path | None = None,
        log_writer: Callable[[str], None] | None = None,
        env: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not STACK_NAME_RE.match(project_name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stack name")

        compose_path = compose_file.resolve()
        base_cmd = ["docker", "compose", "-f", str(compose_path), "-p", project_name]
        if project_directory:
            base_cmd.extend(["--project-directory", str(project_directory.resolve())])
        cmd = self._build_action_command(base_cmd, action, force_recreate)
        cwd = project_directory.resolve() if project_directory else None
        result = self._run_command_stream(cmd, log_writer=log_writer, env=env, cwd=cwd) if log_writer else self._run_command(cmd, env=env, cwd=cwd)
        return {
            "stack": project_name,
            "action": action,
            "compose_file": str(compose_path),
            **result,
        }

    def stack_services(self, name: str) -> list[dict[str, Any]]:
        stack = self._resolve_stack(name)
        return self._get_services(stack)

    def _get_services(self, stack: StackInfo) -> list[dict[str, Any]]:
        cmd = [
            "docker",
            "compose",
            "-f",
            str(stack.compose_file),
            "-p",
            stack.name,
            "ps",
            "--format",
            "json",
        ]
        result = self._run_command(cmd, raise_on_error=False)
        if result["exit_code"] != 0 or not result["stdout"].strip():
            return []

        raw = result["stdout"].strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                return [parsed]
            return []
        except json.JSONDecodeError:
            lines = [line for line in raw.splitlines() if line.strip()]
            services: list[dict[str, Any]] = []
            for line in lines:
                try:
                    services.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            return services

    def _scan_stacks(self) -> list[StackInfo]:
        stacks: list[StackInfo] = []
        try:
            children = list(settings.stacks_path.iterdir())
        except OSError as exc:
            logger.warning("cannot iterate stacks_path %s: %s", settings.stacks_path, exc)
            return []
        logger.info("scanning %s, found %d entries", settings.stacks_path, len(children))
        for child in children:
            if not child.is_dir():
                continue
            compose_file = self._pick_compose_file(child)
            if compose_file:
                stacks.append(StackInfo(name=child.name, path=child, compose_file=compose_file))
        return sorted(stacks, key=lambda item: item.name)

    def _resolve_stack(self, name: str) -> StackInfo:
        if not STACK_NAME_RE.match(name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stack name")
        path = settings.stacks_path / name
        if path.exists() and path.is_dir():
            compose_file = self._pick_compose_file(path)
            if compose_file:
                return StackInfo(name=name, path=path, compose_file=compose_file)

        for project in self._discover_projects():
            if project.name == name:
                return project

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stack not found")

    def _pick_compose_file(self, stack_dir: Path) -> Path | None:
        for name in ("compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"):
            candidate = stack_dir / name
            if candidate.exists():
                return candidate
        return None

    def _discover_projects(self) -> list[StackInfo]:
        result = self._run_command(
            ["docker", "compose", "ls", "--format", "json"],
            raise_on_error=False,
            timeout=10,
        )
        if result["exit_code"] != 0 or not result["stdout"].strip():
            logger.warning(
                "docker compose ls failed: exit_code=%s stderr=%s",
                result["exit_code"],
                result.get("stderr", "")[:200],
            )
            return []
        try:
            projects = json.loads(result["stdout"])
            if not isinstance(projects, list):
                return []
            infos: list[StackInfo] = []
            for project in projects:
                config_files = project.get("ConfigFiles", "")
                first_file = config_files.split(",")[0].strip()
                if first_file:
                    compose_path = Path(first_file)
                    infos.append(
                        StackInfo(
                            name=project["Name"],
                            path=compose_path.parent,
                            compose_file=compose_path,
                        )
                    )
            return infos
        except (json.JSONDecodeError, KeyError):
            return []

    def _run_command(self, cmd: list[str], raise_on_error: bool = True, timeout: int = 60 * 20, env: dict[str, str] | None = None, cwd: Path | None = None) -> dict[str, Any]:
        logger.debug("exec: %s", " ".join(cmd))
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout,
                env=env,
                cwd=cwd,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
            result = {
                "exit_code": -1,
                "stdout": "",
                "stderr": str(exc),
                "command": " ".join(cmd),
            }
            if raise_on_error:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"message": "compose command failed", **result},
                ) from exc
            return result

        result = {
            "exit_code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "command": " ".join(cmd),
        }

        if raise_on_error and proc.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"message": "compose command failed", **result},
            )
        return result

    def _run_command_stream(
        self,
        cmd: list[str],
        *,
        log_writer: Callable[[str], None] | None,
        raise_on_error: bool = True,
        timeout: int = 60 * 20,
        env: dict[str, str] | None = None,
        cwd: Path | None = None,
    ) -> dict[str, Any]:
        logger.debug("exec(stream): %s", " ".join(cmd))
        started = time.monotonic()
        captured: list[str] = []
        buffer = b""

        def emit_line(text: str) -> None:
            if not text:
                return
            if log_writer:
                log_writer(text)
            captured.append(text)
            if len(captured) > 200:
                del captured[:-200]

        if log_writer:
            log_writer(f"$ {' '.join(cmd)}")

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=False,
                env=env,
                cwd=cwd,
            )
        except OSError as exc:
            result = {"exit_code": -1, "stdout": "", "stderr": str(exc), "command": " ".join(cmd)}
            if log_writer:
                log_writer(str(exc))
            if raise_on_error:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"message": "compose command failed", **result},
                ) from exc
            return result

        assert proc.stdout is not None
        sel = selectors.DefaultSelector()
        sel.register(proc.stdout, selectors.EVENT_READ)
        try:
            while True:
                if time.monotonic() - started > timeout:
                    proc.kill()
                    emit_line(f"[timeout] exceeded {timeout}s")
                    raise subprocess.TimeoutExpired(cmd=" ".join(cmd), timeout=timeout)

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
                        emit_line(line_bytes.decode("utf-8", errors="replace"))
                else:
                    if proc.poll() is not None:
                        break

            # Drain remaining
            rest = proc.stdout.read()
            if rest:
                buffer += rest
            if buffer:
                emit_line(buffer.decode("utf-8", errors="replace"))
                buffer = b""
        finally:
            sel.close()

        exit_code = proc.wait()
        result = {
            "exit_code": exit_code,
            "stdout": "\n".join(captured),
            "stderr": "",
            "command": " ".join(cmd),
        }
        if raise_on_error and exit_code != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"message": "compose command failed", **result},
            )
        return result

    def _build_action_command(self, base_cmd: list[str], action: str, force_recreate: bool) -> list[str]:
        if action == "up":
            cmd = base_cmd + ["up", "-d"]
            if force_recreate:
                cmd.append("--force-recreate")
            return cmd
        if action == "down":
            return base_cmd + ["down"]
        if action == "restart":
            return base_cmd + ["restart"]
        if action == "pull":
            return base_cmd + ["pull"]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action {action}")
