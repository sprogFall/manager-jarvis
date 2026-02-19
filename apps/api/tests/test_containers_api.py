from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.services.docker_service import DockerService


class TestContainersAPI:
    def test_list_containers(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "list_containers",
            lambda self, all_containers=True, include_stats=True: [
                {
                    "id": "c1",
                    "name": "web",
                    "image": "nginx:latest",
                    "status": "running",
                    "state": "Up 3 minutes",
                    "ports": ["0.0.0.0:8080->80/tcp"],
                    "stats": {
                        "cpu_percent": 1.2,
                        "memory_usage": 1024,
                        "memory_limit": 4096,
                        "memory_percent": 25.0,
                    },
                }
            ],
        )

        resp = client.get("/api/v1/containers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "c1"
        assert data[0]["name"] == "web"

    def test_get_container_detail(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "get_container_detail",
            lambda self, container_id: {
                "id": container_id,
                "name": "worker",
                "image": "python:3.11",
                "status": "Up",
                "state": "running",
                "command": "python app.py",
                "created": datetime.now(timezone.utc).isoformat(),
                "env": ["A=1"],
                "mounts": [],
                "networks": {},
                "ports": {},
            },
        )

        resp = client.get("/api/v1/containers/c2")
        assert resp.status_code == 200
        assert resp.json()["id"] == "c2"

    def test_create_container_and_audit(self, client, db_session, monkeypatch):
        monkeypatch.setattr(DockerService, "create_container", lambda self, payload: "new-container-id")

        resp = client.post("/api/v1/containers", json={"image": "nginx:latest", "name": "demo"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "new-container-id"
        assert body["action"] == "create"

        audit = db_session.query(AuditLog).filter(AuditLog.action == "container.create").first()
        assert audit is not None
        assert audit.resource_id == "new-container-id"

    def test_batch_stop_requires_confirmation(self, client):
        resp = client.post("/api/v1/containers/batch-stop", json={"container_ids": ["c1"], "confirm": False})
        assert resp.status_code == 400

    def test_batch_stop_success(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "batch_stop",
            lambda self, container_ids: {"stopped": container_ids, "failed": []},
        )

        resp = client.post("/api/v1/containers/batch-stop", json={"container_ids": ["c1", "c2"], "confirm": True})
        assert resp.status_code == 200
        assert resp.json()["stopped"] == ["c1", "c2"]

    def test_kill_requires_confirmation(self, client):
        resp = client.post("/api/v1/containers/c1/kill")
        assert resp.status_code == 400

    def test_kill_success(self, client, monkeypatch):
        monkeypatch.setattr(DockerService, "container_action", lambda self, container_id, action: None)

        resp = client.post("/api/v1/containers/c1/kill", params={"confirm": True})
        assert resp.status_code == 200
        assert resp.json()["action"] == "kill"

    def test_remove_requires_confirmation(self, client):
        resp = client.delete("/api/v1/containers/c1")
        assert resp.status_code == 400

    def test_remove_success(self, client, monkeypatch):
        monkeypatch.setattr(DockerService, "remove_container", lambda self, container_id, force=False: None)

        resp = client.delete("/api/v1/containers/c1", params={"confirm": True, "force": True})
        assert resp.status_code == 200
        assert resp.json()["action"] == "remove"

    def test_logs_plain_text(self, client, monkeypatch):
        monkeypatch.setattr(DockerService, "get_logs_text", lambda self, container_id, **kwargs: "line-1\nline-2")

        resp = client.get("/api/v1/containers/c1/logs")
        assert resp.status_code == 200
        assert "line-1" in resp.text

    def test_logs_follow_sse(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "stream_logs_sse",
            lambda self, container_id, **kwargs: iter(["data: line-1\\n\\n", "event: end\\ndata: stream_closed\\n\\n"]),
        )

        resp = client.get("/api/v1/containers/c1/logs", params={"follow": True})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert "line-1" in resp.text

    def test_export_logs_enqueue_task(self, client, fake_task_manager):
        resp = client.post("/api/v1/containers/c1/logs/export")
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert task_id in fake_task_manager.records
        assert fake_task_manager.records[task_id].task_type == "container.logs.export"

    def test_exec_container(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "exec_in_container",
            lambda self, container_id, cmd, user=None, workdir=None, tty=False, privileged=False: {
                "exit_code": 0,
                "output": "ok",
            },
        )

        resp = client.post("/api/v1/containers/c1/exec", json={"cmd": "echo ok"})
        assert resp.status_code == 200
        assert resp.json()["exit_code"] == 0
        assert resp.json()["output"] == "ok"

    def test_websocket_terminal(self, raw_client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "exec_in_container",
            lambda self, container_id, cmd, user=None, workdir=None, tty=False, privileged=False: {
                "exit_code": 0,
                "output": "terminal-output",
            },
        )

        token = create_access_token("admin")
        with raw_client.websocket_connect(f"/api/v1/containers/c1/terminal/ws?token={token}") as ws:
            ready = ws.receive_json()
            assert ready["type"] == "ready"

            ws.send_text("echo hello")
            result = ws.receive_json()
            assert result["type"] == "result"
            assert result["exit_code"] == 0
            assert result["output"] == "terminal-output"

            ws.send_text("exit")
            bye = ws.receive_json()
            assert bye["type"] == "bye"
