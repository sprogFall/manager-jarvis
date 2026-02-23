from app.core.config import Settings


class TestSettings:
    def test_storage_dirs_default_to_data_root(self, monkeypatch):
        for key in (
            "STACKS_DIR",
            "UPLOAD_DIR",
            "EXPORT_DIR",
            "WORKSPACES_DIR",
            "TASK_LOG_DIR",
        ):
            monkeypatch.delenv(key, raising=False)

        settings = Settings(_env_file=None)

        assert settings.stacks_dir == "/data/stacks"
        assert settings.upload_dir == "/data/uploads"
        assert settings.export_dir == "/data/exports"
        assert settings.workspaces_dir == "/data/workspaces"
        assert settings.task_log_dir == "/data/task-logs"
