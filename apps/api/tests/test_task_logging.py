from app.models.task import TaskRecord
from app.services.task_service import TaskManager


class TestTaskLogging:
    def test_enqueue_creates_log_and_injects_task_id(self, db_session, runtime_paths, monkeypatch):
        manager = TaskManager(max_workers=1)
        manager.register("demo.task", lambda params: params)
        monkeypatch.setattr(manager.executor, "submit", lambda *args, **kwargs: None)

        task_id = manager.enqueue(db_session, task_type="demo.task", params={"hello": "world"}, created_by="admin")

        rec = db_session.get(TaskRecord, task_id)
        assert rec is not None
        assert rec.params is not None
        assert rec.params["_task_id"] == task_id

        log_path = runtime_paths["task_logs"] / f"{task_id}.log"
        assert log_path.exists()
        assert "queued" in log_path.read_text(encoding="utf-8")
