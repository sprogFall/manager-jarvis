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
        (ws_path / "compose.yaml").write_text("services:\n  web:\n    image: nginx\n")

        resp = client.get(f"/api/v1/images/git/workspace/{ws_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["workspace_id"] == ws_id
        assert "Dockerfile" in data["dockerfiles"]
        assert any("backend" in df for df in data["dockerfiles"])
        assert "compose.yaml" in data["compose_files"]
        assert "backend" in data["directories"]

    def test_get_workspace_not_found(self, client):
        resp = client.get(f"/api/v1/images/git/workspace/{'b' * 32}")
        assert resp.status_code == 404

    def test_get_workspace_invalid_id(self, client):
        # ASGI normalizes `../` in the URL, so the request may land on a
        # different (unregistered) route; any non-200 status is acceptable.
        resp = client.get("/api/v1/images/git/workspace/../etc/passwd")
        assert resp.status_code != 200


class TestListWorkspacesEndpoint:
    def test_list_workspaces_returns_meta(self, client, runtime_paths):
        ws_id = "a" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        meta_path = ws_path / ".jarvis" / "workspace.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(
            '{"workspace_id":"%s","repo_url":"https://github.com/user/repo.git","branch":"main","created_at":"2026-01-01T00:00:00Z"}'
            % ws_id,
            encoding="utf-8",
        )

        other_id = "b" * 32
        (runtime_paths["workspaces"] / other_id).mkdir(parents=True, exist_ok=True)
        (runtime_paths["workspaces"] / "not-a-workspace").mkdir(parents=True, exist_ok=True)

        resp = client.get("/api/v1/images/git/workspaces")
        assert resp.status_code == 200
        body = resp.json()

        ids = [item["workspace_id"] for item in body]
        assert ws_id in ids
        assert other_id in ids
        assert "not-a-workspace" not in ids

        entry = next(item for item in body if item["workspace_id"] == ws_id)
        assert entry["repo_url"] == "https://github.com/user/repo.git"
        assert entry["branch"] == "main"
        assert entry["created_at"] == "2026-01-01T00:00:00Z"
        assert "updated_at" in entry
        assert entry["compose_files_count"] == 0


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


class TestWorkspaceComposeEndpoint:
    def test_get_workspace_compose_auto_selects_repo_file(self, client, runtime_paths):
        ws_id = "1" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "compose.yaml").write_text("services:\n  web:\n    image: nginx:latest\n", encoding="utf-8")

        resp = client.get(f"/api/v1/images/git/workspace/{ws_id}/compose")
        assert resp.status_code == 200
        body = resp.json()
        assert body["workspace_id"] == ws_id
        assert body["selected_compose"] == "compose.yaml"
        assert body["source"] == "repository"
        assert body["custom_exists"] is False
        assert "image: nginx:latest" in body["content"]

    def test_workspace_compose_supports_specified_path(self, client, runtime_paths):
        ws_id = "2" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "deploy").mkdir(parents=True, exist_ok=True)
        (ws_path / "deploy" / "docker-compose.prod.yml").write_text(
            "services:\n  api:\n    image: demo/api:prod\n",
            encoding="utf-8",
        )

        resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            params={"compose_path": "deploy/docker-compose.prod.yml"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["selected_compose"] == "deploy/docker-compose.prod.yml"
        assert "image: demo/api:prod" in body["content"]

    def test_workspace_compose_custom_roundtrip(self, client, runtime_paths):
        ws_id = "3" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "compose.yaml").write_text("services:\n  web:\n    image: nginx:latest\n", encoding="utf-8")

        save_resp = client.put(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            json={"compose_path": "compose.yaml", "content": "services:\n  web:\n    image: redis:7\n"},
        )
        assert save_resp.status_code == 200
        save_body = save_resp.json()
        assert save_body["workspace_id"] == ws_id
        assert save_body["compose_path"] == "compose.yaml"
        assert save_body["custom_compose_path"].startswith(".jarvis/compose-overrides/")

        custom_resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            params={"compose_path": "compose.yaml", "source": "custom"},
        )
        assert custom_resp.status_code == 200
        custom_body = custom_resp.json()
        assert custom_body["source"] == "custom"
        assert custom_body["custom_exists"] is True
        assert "image: redis:7" in custom_body["content"]

    def test_workspace_compose_clear_custom_override(self, client, runtime_paths):
        ws_id = "4" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "compose.yaml").write_text("services:\n  web:\n    image: nginx:latest\n", encoding="utf-8")

        client.put(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            json={"compose_path": "compose.yaml", "content": "services:\n  web:\n    image: redis:7\n"},
        )

        delete_resp = client.delete(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            params={"compose_path": "compose.yaml"},
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["deleted"] is True

        missing_resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/compose",
            params={"compose_path": "compose.yaml", "source": "custom"},
        )
        assert missing_resp.status_code == 404

    def test_workspace_compose_action_enqueues_task(self, client, fake_task_manager, runtime_paths):
        ws_id = "5" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "deploy").mkdir(parents=True, exist_ok=True)
        compose_path = ws_path / "deploy" / "compose.yaml"
        compose_path.write_text("services:\n  web:\n    image: nginx:latest\n", encoding="utf-8")

        resp = client.post(
            f"/api/v1/images/git/workspace/{ws_id}/compose/up",
            json={
                "compose_path": "deploy/compose.yaml",
                "source": "repository",
                "project_name": "ws-demo",
                "force_recreate": False,
                "confirm": False,
            },
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.task_type == "image.git.compose.action"
        assert rec.params["workspace_id"] == ws_id
        assert rec.params["action"] == "up"
        assert rec.params["compose_file"] == str(compose_path.resolve())
        assert rec.params["project_directory"] == str((ws_path / "deploy").resolve())
        assert rec.params["project_name"] == "ws-demo"

    def test_workspace_compose_action_custom_missing_returns_404(self, client, runtime_paths):
        ws_id = "6" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "compose.yaml").write_text("services:\n  web:\n    image: nginx:latest\n", encoding="utf-8")

        resp = client.post(
            f"/api/v1/images/git/workspace/{ws_id}/compose/up",
            json={"compose_path": "compose.yaml", "source": "custom"},
        )
        assert resp.status_code == 404


class TestWorkspaceSyncEndpoint:
    def test_workspace_sync_enqueues_task(self, client, fake_task_manager, runtime_paths):
        ws_id = "7" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)

        resp = client.post(f"/api/v1/images/git/workspace/{ws_id}/sync")
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        rec = fake_task_manager.records[task_id]
        assert rec.task_type == "image.git.sync"
        assert rec.params["workspace_id"] == ws_id


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

    def test_clone_raises_runtime_error_when_git_command_missing(self, monkeypatch):
        import pytest as _pytest

        def fake_run(*args, **kwargs):
            raise FileNotFoundError(2, "No such file or directory", "git")

        monkeypatch.setattr(subprocess, "run", fake_run)

        service = GitService()
        with _pytest.raises(RuntimeError, match="git command not found"):
            service.clone(repo_url="https://github.com/user/repo.git")

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

    def test_sync_workspace_raises_runtime_error_when_git_command_missing(self, runtime_paths, monkeypatch):
        import pytest as _pytest

        ws_id = "8" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)

        def fake_run(*args, **kwargs):
            raise FileNotFoundError(2, "No such file or directory", "git")

        monkeypatch.setattr(subprocess, "run", fake_run)

        service = GitService()
        with _pytest.raises(RuntimeError, match="git command not found"):
            service.sync_workspace(ws_id)
