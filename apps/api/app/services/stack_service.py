from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import get_settings

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
        for stack in self._scan_stacks():
            seen_names.add(stack.name)
            stacks.append(
                {
                    "name": stack.name,
                    "path": str(stack.path),
                    "compose_file": str(stack.compose_file),
                    "services": self._get_services(stack),
                }
            )
        for project in self._discover_projects():
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
        return stacks

    def get_stack(self, name: str) -> dict[str, Any]:
        stack = self._resolve_stack(name)
        content = stack.compose_file.read_text(encoding="utf-8")
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

    def run_action(self, name: str, action: str, force_recreate: bool = False) -> dict[str, Any]:
        stack = self._resolve_stack(name)
        base_cmd = ["docker", "compose", "-f", str(stack.compose_file), "-p", name]

        if action == "up":
            cmd = base_cmd + ["up", "-d"]
            if force_recreate:
                cmd.append("--force-recreate")
        elif action == "down":
            cmd = base_cmd + ["down"]
        elif action == "restart":
            cmd = base_cmd + ["restart"]
        elif action == "pull":
            cmd = base_cmd + ["pull"]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action {action}")

        result = self._run_command(cmd)
        return {"stack": name, "action": action, **result}

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
        for child in settings.stacks_path.iterdir():
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

    def _run_command(self, cmd: list[str], raise_on_error: bool = True, timeout: int = 60 * 20) -> dict[str, Any]:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
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
