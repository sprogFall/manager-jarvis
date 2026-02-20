from __future__ import annotations

import json
import os
from collections.abc import Generator
from datetime import datetime
from pathlib import Path
from typing import Any

import docker
from docker.errors import APIError, DockerException, ImageNotFound, NotFound
from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

settings = get_settings()


class DockerService:
    def __init__(self) -> None:
        self.client = docker.DockerClient(base_url=settings.docker_base_url)

    def ping(self) -> bool:
        try:
            self.client.ping()
            return True
        except DockerException:
            return False

    def list_containers(self, all_containers: bool = True, include_stats: bool = True) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for container in self.client.containers.list(all=all_containers):
            attrs = container.attrs
            stats = None
            if include_stats and container.status == "running":
                container.reload()
                attrs = container.attrs
                stats = self._container_stats(container)
            items.append(
                {
                    "id": container.id,
                    "name": container.name,
                    "image": attrs.get("Config", {}).get("Image") or attrs.get("Image", ""),
                    "status": attrs.get("State", {}).get("Status", "unknown"),
                    "state": attrs.get("Status", container.status or "unknown"),
                    "ports": self._format_ports(attrs.get("NetworkSettings", {}).get("Ports") or {}),
                    "stats": stats,
                }
            )
        return items

    def get_container_detail(self, container_id: str) -> dict[str, Any]:
        container = self._get_container(container_id)
        container.reload()
        attrs = container.attrs
        command = attrs.get("Config", {}).get("Cmd") or ""
        if isinstance(command, list):
            command = " ".join(command)
        state = attrs.get("State", {}).get("Status", "unknown")
        stats = None
        if state == "running":
            stats = self._container_stats(container)
        return {
            "id": container.id,
            "name": container.name,
            "image": attrs.get("Config", {}).get("Image", ""),
            "status": attrs.get("Status", container.status),
            "state": state,
            "command": command,
            "created": attrs.get("Created", ""),
            "env": attrs.get("Config", {}).get("Env") or [],
            "mounts": attrs.get("Mounts") or [],
            "networks": attrs.get("NetworkSettings", {}).get("Networks") or {},
            "ports": attrs.get("NetworkSettings", {}).get("Ports") or {},
            "stats": stats,
        }

    def container_action(self, container_id: str, action: str) -> None:
        container = self._get_container(container_id)
        if action == "start":
            container.start()
        elif action == "stop":
            container.stop()
        elif action == "restart":
            container.restart()
        elif action == "kill":
            container.kill()
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action {action}")

    def remove_container(self, container_id: str, force: bool = False) -> None:
        container = self._get_container(container_id)
        container.remove(force=force)

    def batch_stop(self, container_ids: list[str]) -> dict[str, Any]:
        stopped: list[str] = []
        failed: list[dict[str, str]] = []
        for cid in container_ids:
            try:
                self._get_container(cid).stop()
                stopped.append(cid)
            except Exception as exc:  # noqa: BLE001
                failed.append({"id": cid, "error": str(exc)})
        return {"stopped": stopped, "failed": failed}

    def create_container(self, payload: dict[str, Any]) -> str:
        kwargs: dict[str, Any] = {
            "image": payload["image"],
            "name": payload.get("name"),
            "command": payload.get("command"),
            "environment": payload.get("environment"),
            "ports": payload.get("ports"),
            "volumes": payload.get("volumes"),
            "network": payload.get("network"),
            "restart_policy": payload.get("restart_policy"),
            "detach": True,
        }
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        container = self.client.containers.run(**kwargs)
        return container.id

    def get_logs_text(
        self,
        container_id: str,
        *,
        tail: int | str = 500,
        since: int | str | datetime | None = None,
        until: int | str | datetime | None = None,
        timestamps: bool = True,
        search: str | None = None,
    ) -> str:
        container = self._get_container(container_id)
        raw = container.logs(tail=tail, since=since, until=until, timestamps=timestamps)
        text = raw.decode("utf-8", errors="replace")
        if search:
            text = "\n".join(line for line in text.splitlines() if search in line)
        return text

    def stream_logs_sse(
        self,
        container_id: str,
        *,
        tail: int | str = 200,
        since: int | str | datetime | None = None,
        until: int | str | datetime | None = None,
        timestamps: bool = True,
        search: str | None = None,
    ) -> Generator[str, None, None]:
        container = self._get_container(container_id)
        stream = container.logs(
            stream=True,
            follow=True,
            tail=tail,
            since=since,
            until=until,
            timestamps=timestamps,
        )
        try:
            for chunk in stream:
                line = chunk.decode("utf-8", errors="replace").rstrip("\n")
                if search and search not in line:
                    continue
                yield f"data: {line}\n\n"
        finally:
            yield "event: end\ndata: stream_closed\n\n"

    def exec_in_container(
        self,
        container_id: str,
        cmd: list[str] | str,
        user: str | None = None,
        workdir: str | None = None,
        tty: bool = False,
        privileged: bool = False,
    ) -> dict[str, Any]:
        container = self._get_container(container_id)
        exec_id = self.client.api.exec_create(
            container.id,
            cmd,
            user=user,
            workdir=workdir,
            tty=tty,
            privileged=privileged,
            stdin=False,
            stdout=True,
            stderr=True,
        )["Id"]
        output = self.client.api.exec_start(exec_id, tty=tty, stream=False)
        inspect = self.client.api.exec_inspect(exec_id)
        out_text = output.decode("utf-8", errors="replace") if isinstance(output, bytes) else str(output)
        return {"exit_code": inspect.get("ExitCode", -1), "output": out_text}

    def list_images(self) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = []
        for image in self.client.images.list():
            attrs = image.attrs
            data.append(
                {
                    "id": image.id,
                    "tags": image.tags,
                    "size": attrs.get("Size", 0),
                    "created": attrs.get("Created", ""),
                }
            )
        return data

    def pull_image(self, image: str, tag: str | None = None, auth: dict[str, Any] | None = None) -> dict[str, Any]:
        api = self.client.api
        target = f"{image}:{tag}" if tag else image
        progress: list[dict[str, Any]] = []
        for line in api.pull(repository=image, tag=tag, stream=True, decode=True, auth_config=auth):
            progress.append(line)
        return {"target": target, "events": progress[-50:]}

    def remove_image(self, image: str, force: bool = False, noprune: bool = False) -> list[dict[str, Any]]:
        refs = self._image_in_use_containers(image)
        if refs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Image is used by containers: {', '.join(refs)}",
            )
        try:
            return self.client.images.remove(image=image, force=force, noprune=noprune)
        except ImageNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found") from exc

    def build_image(
        self,
        *,
        tag: str,
        path: str | None = None,
        dockerfile: str = "Dockerfile",
        no_cache: bool = False,
        pull: bool = False,
        git_url: str | None = None,
    ) -> dict[str, Any]:
        build_path = git_url or path
        if not build_path:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="path or git_url is required")
        output: list[dict[str, Any]] = []
        for chunk in self.client.api.build(
            path=build_path,
            dockerfile=dockerfile,
            tag=tag,
            decode=True,
            nocache=no_cache,
            pull=pull,
            rm=True,
        ):
            output.append(chunk)
        return {"tag": tag, "events": output[-100:]}

    def build_image_from_archive(
        self,
        *,
        tag: str,
        archive_path: Path,
        dockerfile: str = "Dockerfile",
        no_cache: bool = False,
        pull: bool = False,
    ) -> dict[str, Any]:
        output: list[dict[str, Any]] = []
        encoding = "gzip" if str(archive_path).endswith(".gz") else None
        with archive_path.open("rb") as fp:
            for chunk in self.client.api.build(
                fileobj=fp,
                custom_context=True,
                encoding=encoding,
                dockerfile=dockerfile,
                tag=tag,
                decode=True,
                nocache=no_cache,
                pull=pull,
                rm=True,
            ):
                output.append(chunk)
        return {"tag": tag, "events": output[-100:]}

    def load_image_from_file(self, file_path: Path) -> dict[str, Any]:
        with file_path.open("rb") as fp:
            data = fp.read()
            res = self.client.images.load(data)
        tags: list[str] = []
        for item in res:
            tags.extend(item.tags)
        return {"loaded": tags}

    def save_image_to_file(self, image: str, file_path: Path) -> dict[str, Any]:
        img = self.client.images.get(image)
        with file_path.open("wb") as fp:
            for chunk in img.save(named=True):
                fp.write(chunk)
        return {"file": str(file_path), "size": file_path.stat().st_size}

    async def save_upload_temp(self, upload: UploadFile) -> Path:
        filename = (upload.filename or "").lower()
        if not (filename.endswith(".tar") or filename.endswith(".tar.gz")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .tar/.tar.gz is supported")

        settings.upload_path.mkdir(parents=True, exist_ok=True)
        target = settings.upload_path / f"{datetime.utcnow().timestamp()}_{os.path.basename(upload.filename or 'image.tar')}"

        total = 0
        max_size = settings.max_upload_size_mb * 1024 * 1024
        with target.open("wb") as fp:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_size:
                    fp.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload exceeds size limit")
                fp.write(chunk)
        return target

    def _get_container(self, container_id: str):
        try:
            return self.client.containers.get(container_id)
        except NotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Container not found") from exc
        except APIError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    def _container_stats(self, container) -> dict[str, Any]:
        try:
            data = container.stats(stream=False)
        except Exception:  # noqa: BLE001
            return {"cpu_percent": 0.0, "memory_usage": 0, "memory_limit": 0, "memory_percent": 0.0}

        cpu_stats = data.get("cpu_stats", {})
        pre_cpu_stats = data.get("precpu_stats", {})
        cpu_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        pre_cpu_total = pre_cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        system_total = cpu_stats.get("system_cpu_usage", 0)
        pre_system_total = pre_cpu_stats.get("system_cpu_usage", 0)
        cpu_delta = cpu_total - pre_cpu_total
        system_delta = system_total - pre_system_total
        online_cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage", []) or [1])
        cpu_percent = 0.0
        if cpu_delta > 0 and system_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0

        mem_stats = data.get("memory_stats", {})
        mem_usage = mem_stats.get("usage", 0)
        mem_limit = mem_stats.get("limit", 0)
        mem_percent = (mem_usage / mem_limit * 100.0) if mem_limit else 0.0

        return {
            "cpu_percent": round(cpu_percent, 2),
            "memory_usage": mem_usage,
            "memory_limit": mem_limit,
            "memory_percent": round(mem_percent, 2),
        }

    def _format_ports(self, ports: dict[str, Any]) -> list[str]:
        items: list[str] = []
        for container_port, bindings in ports.items():
            if not bindings:
                items.append(container_port)
                continue
            for bind in bindings:
                host_ip = bind.get("HostIp", "0.0.0.0")
                host_port = bind.get("HostPort", "")
                items.append(f"{host_ip}:{host_port}->{container_port}")
        return items

    def _image_in_use_containers(self, image_ref: str) -> list[str]:
        refs: list[str] = []
        for container in self.client.containers.list(all=True):
            try:
                image_id = container.image.id
                tags = set(container.image.tags or [])
                possible_refs = tags | {image_id, container.image.short_id}
                if image_ref in possible_refs:
                    refs.append(container.name)
            except Exception:  # noqa: BLE001
                continue
        return refs


def serialize_docker_exception(exc: Exception) -> str:
    if isinstance(exc, (DockerException, APIError)):
        return str(exc)
    try:
        return json.dumps({"error": str(exc)})
    except TypeError:
        return str(exc)
