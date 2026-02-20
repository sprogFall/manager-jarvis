import json
import subprocess
from datetime import datetime, timezone

from app.models.task import TaskRecord
from app.services.stack_service import StackService
import app.services.stack_service as stack_module


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

        monkeypatch.setattr(stack_module, "subprocess", type("M", (), {"run": staticmethod(fake_run)})())

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

        monkeypatch.setattr(stack_module, "subprocess", type("M", (), {"run": staticmethod(fake_run)})())

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        names = [s["name"] for s in resp.json()]
        assert names.count("my-stack") == 1

    def test_discover_projects_handles_failure_gracefully(self, client, monkeypatch):
        """docker compose ls 失败时不影响 STACKS_DIR 栈的返回"""
        def fake_run(cmd, **kwargs):
            return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="command not found")

        monkeypatch.setattr(stack_module, "subprocess", type("M", (), {"run": staticmethod(fake_run)})())

        resp = client.get("/api/v1/stacks")
        assert resp.status_code == 200
        assert resp.json() == []
