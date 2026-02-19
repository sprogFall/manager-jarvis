import subprocess
from pathlib import Path

from app.services.git_service import GitService


class TestGitCloneEndpoint:
    def test_git_clone_enqueues_task(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/git/clone",
            json={"repo_url": "https://github.com/user/repo"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.task_type == "image.git.clone"
        assert rec.params["repo_url"] == "https://github.com/user/repo"

    def test_git_clone_with_branch_and_token(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/git/clone",
            json={"repo_url": "https://gitee.com/user/repo", "branch": "main", "token": "mytoken"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.params["branch"] == "main"
        assert rec.params["token"] == "mytoken"


class TestGetWorkspaceEndpoint:
    def test_get_workspace_lists_dockerfiles(self, client, runtime_paths):
        ws_id = "a" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "Dockerfile").write_text("FROM alpine")
        (ws_path / "backend").mkdir()
        (ws_path / "backend" / "Dockerfile").write_text("FROM python:3.11")

        resp = client.get(f"/api/v1/images/git/workspace/{ws_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["workspace_id"] == ws_id
        assert "Dockerfile" in data["dockerfiles"]
        assert any("backend" in df for df in data["dockerfiles"])
        assert "backend" in data["directories"]

    def test_get_workspace_not_found(self, client):
        resp = client.get(f"/api/v1/images/git/workspace/{'b' * 32}")
        assert resp.status_code == 404

    def test_get_workspace_invalid_id(self, client):
        # ASGI normalizes `../` in the URL, so the request may land on a
        # different (unregistered) route; any non-200 status is acceptable.
        resp = client.get("/api/v1/images/git/workspace/../etc/passwd")
        assert resp.status_code != 200


class TestBuildFromWorkspaceEndpoint:
    def test_build_from_workspace_enqueues_task(self, client, fake_task_manager, runtime_paths):
        ws_id = "c" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "Dockerfile").write_text("FROM alpine")

        resp = client.post(
            f"/api/v1/images/git/workspace/{ws_id}/build",
            json={"tag": "myapp:latest"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.task_type == "image.git.build"
        assert rec.params["workspace_id"] == ws_id
        assert rec.params["tag"] == "myapp:latest"

    def test_build_from_workspace_includes_context_path(self, client, fake_task_manager, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "backend").mkdir()
        (ws_path / "backend" / "Dockerfile").write_text("FROM python:3.11")

        resp = client.post(
            f"/api/v1/images/git/workspace/{ws_id}/build",
            json={"tag": "backend:v1", "context_path": "backend", "dockerfile": "Dockerfile"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.params["context_path"] == "backend"

    def test_build_from_workspace_not_found(self, client, fake_task_manager):
        resp = client.post(
            f"/api/v1/images/git/workspace/{'f' * 32}/build",
            json={"tag": "ghost:latest"},
        )
        assert resp.status_code == 404


class TestDeleteWorkspaceEndpoint:
    def test_delete_workspace_removes_directory(self, client, runtime_paths):
        ws_id = "d" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "Dockerfile").write_text("FROM alpine")

        resp = client.delete(f"/api/v1/images/git/workspace/{ws_id}")
        assert resp.status_code == 200
        assert resp.json() == {"deleted": ws_id}
        assert not ws_path.exists()

    def test_delete_workspace_invalid_id(self, client):
        resp = client.delete("/api/v1/images/git/workspace/bad-id!")
        assert resp.status_code == 400


class TestLoadFromUrlEndpoint:
    def test_load_from_url_enqueues_task(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/load-url",
            json={"url": "https://example.com/releases/image.tar"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.task_type == "image.load.url"
        assert rec.params["url"] == "https://example.com/releases/image.tar"

    def test_load_from_url_with_auth_token(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/load-url",
            json={"url": "https://github.com/user/repo/releases/download/v1/image.tar", "auth_token": "ghp_token"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.params["auth_token"] == "ghp_token"


class TestGitServiceUnit:
    def test_inject_token_github(self):
        from app.services.git_service import _inject_token

        result = _inject_token("https://github.com/user/repo.git", "mytoken")
        assert "mytoken" in result
        assert "x-token" in result
        assert "github.com" in result

    def test_validate_workspace_id_valid(self):
        from app.services.git_service import _validate_workspace_id

        _validate_workspace_id("a" * 32)  # should not raise

    def test_validate_workspace_id_too_short(self):
        import pytest as _pytest

        from app.services.git_service import _validate_workspace_id

        with _pytest.raises(ValueError):
            _validate_workspace_id("abc")

    def test_validate_workspace_id_path_traversal(self):
        import pytest as _pytest

        from app.services.git_service import _validate_workspace_id

        with _pytest.raises(ValueError):
            _validate_workspace_id("../../../etc/passwd!!!!!!!!!!!!!!")



    def test_clone_applies_proxy_env(self, monkeypatch):
        captured = {}

        def fake_run(cmd, check, capture_output, timeout, env):
            captured['cmd'] = cmd
            captured['env'] = env
            return subprocess.CompletedProcess(cmd, 0, b'', b'')

        monkeypatch.setattr(subprocess, 'run', fake_run)

        service = GitService()
        workspace_id, _ = service.clone(
            repo_url='https://github.com/user/repo.git',
            proxy_url='http://127.0.0.1:7890',
        )

        assert captured['env']['HTTP_PROXY'] == 'http://127.0.0.1:7890'
        assert captured['env']['HTTPS_PROXY'] == 'http://127.0.0.1:7890'
        service.cleanup(workspace_id)

    def test_list_workspace_excludes_git_dir(self, runtime_paths):
        ws_id = "9" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".git").mkdir()
        (ws_path / ".git" / "Dockerfile").write_text("should be excluded")
        (ws_path / "Dockerfile").write_text("FROM alpine")

        service = GitService()
        info = service.list_workspace(ws_id)
        assert all(".git" not in df for df in info["dockerfiles"])
        assert "Dockerfile" in info["dockerfiles"]
