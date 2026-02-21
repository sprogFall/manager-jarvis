from datetime import datetime, timezone

from app.models.task import TaskRecord


class TestTasksAPI:
    def test_list_tasks(self, client, fake_task_manager):
        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="image.pull",
            status="queued",
            resource_type="image",
            resource_id="nginx:latest",
            params={"image": "nginx"},
            result=None,
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=None,
            finished_at=None,
        )

        resp = client.get("/api/v1/tasks")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["id"] == "task-1"

    def test_task_detail(self, client, fake_task_manager):
        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="image.pull",
            status="queued",
            resource_type="image",
            resource_id="nginx:latest",
            params={"image": "nginx"},
            result=None,
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=None,
            finished_at=None,
        )

        resp = client.get("/api/v1/tasks/task-1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "task-1"

    def test_retry_failed_task(self, client, fake_task_manager):
        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="image.pull",
            status="failed",
            resource_type="image",
            resource_id="nginx:latest",
            params={"image": "nginx"},
            result=None,
            error="failed",
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=None,
            finished_at=None,
        )

        resp = client.post("/api/v1/tasks/task-1/retry")
        assert resp.status_code == 200
        body = resp.json()
        assert body["original_task_id"] == "task-1"
        assert body["new_task_id"] in fake_task_manager.records

    def test_download_task_file_success(self, client, fake_task_manager, runtime_paths):
        file_path = runtime_paths["exports"] / "logs.txt"
        file_path.write_text("hello", encoding="utf-8")

        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="container.logs.export",
            status="success",
            resource_type="container",
            resource_id="c1",
            params={},
            result={"file": str(file_path)},
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=None,
            finished_at=datetime.now(timezone.utc),
        )

        resp = client.get("/api/v1/tasks/task-1/download")
        assert resp.status_code == 200
        assert resp.content == b"hello"

    def test_download_task_file_without_result(self, client, fake_task_manager):
        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="container.logs.export",
            status="failed",
            resource_type="container",
            resource_id="c1",
            params={},
            result=None,
            error="failed",
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=None,
            finished_at=datetime.now(timezone.utc),
        )

        resp = client.get("/api/v1/tasks/task-1/download")
        assert resp.status_code == 400

    def test_task_logs_returns_text(self, client, fake_task_manager, runtime_paths):
        log_path = runtime_paths["task_logs"] / "task-1.log"
        log_path.write_text("line-1\nline-2\n", encoding="utf-8")

        fake_task_manager.records["task-1"] = TaskRecord(
            id="task-1",
            task_type="stack.action",
            status="running",
            resource_type="stack",
            resource_id="demo",
            params={},
            result=None,
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            finished_at=None,
        )

        resp = client.get("/api/v1/tasks/task-1/logs")
        assert resp.status_code == 200
        assert resp.text == "line-1\nline-2\n"

    def test_task_logs_supports_tail(self, client, fake_task_manager, runtime_paths):
        log_path = runtime_paths["task_logs"] / "task-2.log"
        log_path.write_text("a\nb\nc\n", encoding="utf-8")

        fake_task_manager.records["task-2"] = TaskRecord(
            id="task-2",
            task_type="stack.action",
            status="running",
            resource_type="stack",
            resource_id="demo",
            params={},
            result=None,
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            finished_at=None,
        )

        resp = client.get("/api/v1/tasks/task-2/logs", params={"tail": 2})
        assert resp.status_code == 200
        assert resp.text == "b\nc\n"

    def test_task_logs_missing_returns_404(self, client, fake_task_manager):
        fake_task_manager.records["task-3"] = TaskRecord(
            id="task-3",
            task_type="stack.action",
            status="running",
            resource_type="stack",
            resource_id="demo",
            params={},
            result=None,
            error=None,
            retry_of=None,
            created_by="admin",
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            finished_at=None,
        )

        resp = client.get("/api/v1/tasks/task-3/logs")
        assert resp.status_code == 404
