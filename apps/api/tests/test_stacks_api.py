from datetime import datetime, timezone

from app.models.task import TaskRecord
from app.services.stack_service import StackService


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
