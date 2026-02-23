import json
import os
import subprocess
from datetime import datetime, timezone
from unittest.mock import patch

from app.models.task import TaskRecord
from app.services.stack_service import StackService
import app.services.stack_service as stack_module


def _make_subprocess_mock(fake_run):
    """创建包含 run/TimeoutExpired/CompletedProcess 的 subprocess 替身"""
    return type("M", (), {
        "run": staticmethod(fake_run),
        "TimeoutExpired": subprocess.TimeoutExpired,
        "CompletedProcess": subprocess.CompletedProcess,
    })()


class TestStacksAPI:
    def test_list_stacks(self, client, monkeypatch):
        monkeypatch.setattr(
            StackService,
            "list_stacks",
            lambda self: [
                {
                    "name": "demo",
                    "path": "/tmp/demo",
                    "compose_file": "/tmp/demo/compose.yaml",
                    "services": [],
                }
            ],
        )

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        assert resp.json()[0]["name"] == "demo"

    def test_stack_detail_includes_recent_operations(self, client, db_session, monkeypatch):
        now = datetime.now(timezone.utc)
        db_session.add(
            TaskRecord(
                id="task-stack-1",
                task_type="stack.action",
                status="success",
                resource_type="stack",
                resource_id="demo",
                params={"action": "up"},
                result={"ok": True},
                error=None,
                retry_of=None,
                created_by="admin",
                created_at=now,
                started_at=now,
                finished_at=now,
            )
        )
        db_session.commit()

        monkeypatch.setattr(
            StackService,
            "get_stack",
            lambda self, name: {
                "name": name,
                "compose_file": f"/tmp/{name}/compose.yaml",
                "content": "services:\n  web:\n    image: nginx:latest\n",
                "services": [{"Service": "web", "State": "running"}],
            },
        )

        resp = client.get("/api/v1/stacks/demo")
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "demo"
        assert len(body["recent_operations"]) == 1
        assert body["recent_operations"][0]["id"] == "task-stack-1"

    def test_import_stack_success(self, client, runtime_paths):
        resp = client.post(
            "/api/v1/stacks/import",
            json={
                "name": "demo",
                "content": "services:\n  web:\n    image: nginx\n",
                "compose_filename": "compose.yaml",
            },
        )
        assert resp.status_code == 200

        compose_file = runtime_paths["stacks"] / "demo" / "compose.yaml"
        assert compose_file.exists()
        assert "image: nginx" in compose_file.read_text(encoding="utf-8")

    def test_import_stack_invalid_name(self, client):
        resp = client.post(
            "/api/v1/stacks/import",
            json={
                "name": "../bad",
                "content": "services: {}",
                "compose_filename": "compose.yaml",
            },
        )
        assert resp.status_code == 400

    def test_update_compose(self, client, monkeypatch):
        monkeypatch.setattr(
            StackService,
            "update_compose",
            lambda self, name, content: {"name": name, "compose_file": f"/tmp/{name}/compose.yaml"},
        )

        resp = client.put("/api/v1/stacks/demo/compose", json={"content": "services: {}"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "demo"

    def test_stack_action_requires_confirmation_for_force_recreate(self, client):
        resp = client.post(
            "/api/v1/stacks/demo/up",
            json={"force_recreate": True, "confirm": False},
        )
        assert resp.status_code == 400

    def test_stack_action_enqueue_task(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/stacks/demo/up",
            json={"force_recreate": False, "confirm": False},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert fake_task_manager.records[task_id].task_type == "stack.action"

    def test_list_stacks_discovers_running_projects(self, client, monkeypatch):
        """docker compose ls 发现的运行中项目应出现在栈列表中"""
        ls_output = json.dumps([
            {"Name": "web-app", "Status": "running(2)", "ConfigFiles": "/opt/web/compose.yaml"},
        ])
        ps_output = json.dumps([{"Service": "nginx", "State": "running"}])

        def fake_run(cmd, **kwargs):
            if "ls" in cmd:
                return subprocess.CompletedProcess(cmd, 0, stdout=ls_output, stderr="")
            if "ps" in cmd:
                return subprocess.CompletedProcess(cmd, 0, stdout=ps_output, stderr="")
            return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="")

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        names = [s["name"] for s in resp.json()]
        assert "web-app" in names

    def test_list_stacks_deduplicates_dir_and_discovered(self, client, runtime_paths, monkeypatch):
        """STACKS_DIR 中已有的栈不会被 docker compose ls 重复列出"""
        stack_dir = runtime_paths["stacks"] / "my-stack"
        stack_dir.mkdir()
        (stack_dir / "compose.yaml").write_text("services:\n  web:\n    image: nginx\n")

        ls_output = json.dumps([
            {"Name": "my-stack", "Status": "running(1)", "ConfigFiles": "/other/compose.yaml"},
        ])

        def fake_run(cmd, **kwargs):
            if "ls" in cmd:
                return subprocess.CompletedProcess(cmd, 0, stdout=ls_output, stderr="")
            if "ps" in cmd:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="")

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        names = [s["name"] for s in resp.json()]
        assert names.count("my-stack") == 1

    def test_discover_projects_handles_failure_gracefully(self, client, monkeypatch):
        """docker compose ls 失败时不影响 STACKS_DIR 栈的返回"""
        def fake_run(cmd, **kwargs):
            return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="command not found")

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_stacks_subprocess_file_not_found(self, client, monkeypatch):
        """subprocess.run 抛出 FileNotFoundError 时返回 200 空列表"""
        def fake_run(cmd, **kwargs):
            raise FileNotFoundError("docker not found")

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_stacks_subprocess_timeout(self, client, monkeypatch):
        """subprocess.run 抛出 TimeoutExpired 时返回 200 空列表"""
        def fake_run(cmd, **kwargs):
            raise subprocess.TimeoutExpired(cmd, 10)

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_stack_compose_file_not_found(self, client, monkeypatch):
        """compose 文件不存在时 get_stack 返回 404"""
        from pathlib import Path

        monkeypatch.setattr(
            StackService,
            "_resolve_stack",
            lambda self, name: stack_module.StackInfo(
                name=name,
                path=Path("/tmp/nonexist"),
                compose_file=Path("/tmp/nonexist/compose.yaml"),
            ),
        )

        resp = client.get("/api/v1/stacks/demo")
        assert resp.status_code == 404


class TestComposeProxyEnv:
    def test_run_command_passes_env_to_subprocess(self, monkeypatch):
        captured = {}

        def fake_run(cmd, **kwargs):
            captured["env"] = kwargs.get("env")
            return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

        monkeypatch.setattr(stack_module, "subprocess", _make_subprocess_mock(fake_run))

        service = StackService()
        proxy_env = {**os.environ, "HTTP_PROXY": "http://proxy:7890", "HTTPS_PROXY": "http://proxy:7890"}
        service._run_command(["echo", "test"], env=proxy_env)
        assert captured["env"]["HTTP_PROXY"] == "http://proxy:7890"

    def test_run_command_stream_passes_env_to_popen(self, monkeypatch):
        captured = {}

        class FakeProc:
            def __init__(self, env):
                captured["env"] = env
                read_fd, write_fd = os.pipe()
                os.write(write_fd, b"done\n")
                os.close(write_fd)
                self.stdout = os.fdopen(read_fd, "rb")
                self.returncode = 0

            def poll(self):
                return 0

            def wait(self):
                return 0

        def fake_popen(cmd, **kwargs):
            return FakeProc(kwargs.get("env"))

        monkeypatch.setattr(subprocess, "Popen", fake_popen)

        service = StackService()
        proxy_env = {**os.environ, "HTTPS_PROXY": "http://proxy:7890"}
        service._run_command_stream(["echo", "test"], log_writer=lambda x: None, env=proxy_env)
        assert captured["env"]["HTTPS_PROXY"] == "http://proxy:7890"

    def test_task_workspace_compose_action_injects_proxy(self, monkeypatch):
        captured = {}

        def fake_run_compose_action(self, **kwargs):
            captured["env"] = kwargs.get("env")
            return {"stack": "test", "action": "up", "exit_code": 0, "stdout": "", "stderr": "", "command": ""}

        monkeypatch.setattr(StackService, "run_compose_action", fake_run_compose_action)

        with patch("app.services.proxy_service.get_runtime_proxy_url", return_value="http://my-proxy:7890"):
            from app.services.task_service import task_workspace_compose_action

            task_workspace_compose_action({
                "compose_file": "/tmp/compose.yaml",
                "project_directory": "/tmp",
                "project_name": "test",
                "action": "up",
                "force_recreate": False,
            })

        assert captured["env"] is not None
        assert captured["env"]["HTTP_PROXY"] == "http://my-proxy:7890"

    def test_task_stack_action_injects_proxy(self, monkeypatch):
        captured = {}

        def fake_run_action(self, name, action, force_recreate=False, *, log_writer=None, env=None):
            captured["env"] = env
            return {"stack": name, "action": action, "exit_code": 0, "stdout": "", "stderr": "", "command": ""}

        monkeypatch.setattr(StackService, "run_action", fake_run_action)

        with patch("app.services.proxy_service.get_runtime_proxy_url", return_value="http://my-proxy:7890"):
            from app.services.task_service import task_stack_action

            task_stack_action({
                "name": "demo",
                "action": "up",
                "force_recreate": False,
            })

        assert captured["env"] is not None
        assert captured["env"]["HTTP_PROXY"] == "http://my-proxy:7890"
