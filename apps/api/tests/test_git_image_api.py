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
    def test_delete_workspace_requires_confirmation(self, client, runtime_paths):
        ws_id = "d" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)

        resp = client.delete(f"/api/v1/images/git/workspace/{ws_id}")
        assert resp.status_code == 400

    def test_delete_workspace_removes_directory(self, client, runtime_paths):
        ws_id = "d" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "Dockerfile").write_text("FROM alpine")

        resp = client.delete(f"/api/v1/images/git/workspace/{ws_id}?confirm=true")
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

    def test_parse_env_content_basic(self):
        content = "# DB config\nDB_HOST=localhost\nDB_PORT=5432\n"
        result = GitService._parse_env_content(content)
        assert len(result) == 2
        assert result[0] == {"key": "DB_HOST", "value": "localhost", "comment": "DB config"}
        assert result[1] == {"key": "DB_PORT", "value": "5432", "comment": ""}

    def test_parse_env_content_empty(self):
        result = GitService._parse_env_content("")
        assert result == []

    def test_parse_env_content_strips_quotes(self):
        content = 'KEY1="hello world"\nKEY2=\'single\'\n'
        result = GitService._parse_env_content(content)
        assert result[0]["value"] == "hello world"
        assert result[1]["value"] == "single"

    def test_parse_env_content_multiline_comments(self):
        content = "# Section A\n# more detail\nFOO=bar\n"
        result = GitService._parse_env_content(content)
        assert len(result) == 1
        assert result[0]["comment"] == "Section A\nmore detail"

    def test_parse_env_content_blank_lines_reset_comment(self):
        content = "# old comment\n\nKEY=val\n"
        result = GitService._parse_env_content(content)
        assert result[0]["comment"] == ""

    def test_env_target_path_example(self):
        assert GitService._env_target_path(".env.example") == ".env"

    def test_env_target_path_sample(self):
        assert GitService._env_target_path("backend/.env.sample") == "backend/.env"

    def test_env_target_path_template(self):
        assert GitService._env_target_path(".env.template") == ".env"

    def test_discover_env_templates(self, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("KEY=val\n")
        (ws_path / "backend").mkdir()
        (ws_path / "backend" / ".env.sample").write_text("DB=x\n")
        (ws_path / ".git").mkdir()
        (ws_path / ".git" / ".env.example").write_text("ignored\n")

        service = GitService()
        templates = service.discover_env_templates(ws_id)
        assert ".env.example" in templates
        assert "backend/.env.sample" in templates
        assert ".git/.env.example" not in templates

    def test_read_env_template_returns_parsed_variables(self, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("# Server\nHOST=localhost\nPORT=8080\n")

        service = GitService()
        info = service.read_env_template(ws_id, ".env.example")
        assert info["template_variables"][0]["key"] == "HOST"
        assert info["custom_exists"] is False

    def test_save_and_read_env_file(self, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("KEY=default\n")

        service = GitService()
        service.save_env_file(ws_id, ".env.example", "KEY=custom\n")
        info = service.read_env_template(ws_id, ".env.example")
        assert info["custom_exists"] is True
        assert info["custom_variables"][0]["value"] == "custom"

    def test_clear_env_file(self, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("KEY=val\n")
        target = ws_path / ".env"
        target.write_text("KEY=custom\n")
        assert target.exists()

        service = GitService()
        result = service.clear_env_file(ws_id, ".env.example")
        assert result["deleted"] is True
        assert not target.exists()


class TestWorkspaceEnvEndpoint:
    def test_discover_multiple_env_templates(self, client, runtime_paths):
        ws_id = "a" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("# DB\nDB_HOST=localhost\n")
        (ws_path / "backend").mkdir()
        (ws_path / "backend" / ".env.sample").write_text("API_KEY=xxx\n")

        resp = client.get(f"/api/v1/images/git/workspace/{ws_id}/env")
        assert resp.status_code == 200
        body = resp.json()
        assert ".env.example" in body["env_templates"]
        assert "backend/.env.sample" in body["env_templates"]
        assert body["selected_template"] == ".env.example"
        assert body["target_path"] == ".env"
        assert body["template_variables"][0]["key"] == "DB_HOST"

    def test_no_templates_returns_empty(self, client, runtime_paths):
        ws_id = "b" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)

        resp = client.get(f"/api/v1/images/git/workspace/{ws_id}/env")
        assert resp.status_code == 200
        body = resp.json()
        assert body["env_templates"] == []
        assert body["selected_template"] is None

    def test_save_then_read_custom(self, client, runtime_paths):
        ws_id = "c" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("KEY=default\n")

        save_resp = client.put(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            json={"template_path": ".env.example", "content": "KEY=custom\n"},
        )
        assert save_resp.status_code == 200

        get_resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            params={"template_path": ".env.example"},
        )
        assert get_resp.status_code == 200
        body = get_resp.json()
        assert body["custom_exists"] is True
        assert body["custom_variables"][0]["value"] == "custom"

    def test_delete_env_file(self, client, runtime_paths):
        ws_id = "d" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("KEY=val\n")
        (ws_path / ".env").write_text("KEY=custom\n")

        resp = client.delete(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            params={"template_path": ".env.example"},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        assert not (ws_path / ".env").exists()

    def test_comment_association(self, client, runtime_paths):
        ws_id = "e" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text("# Database\nDB_HOST=localhost\nDB_PORT=5432\n")

        resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            params={"template_path": ".env.example"},
        )
        body = resp.json()
        assert body["template_variables"][0]["comment"] == "Database"
        assert body["template_variables"][1]["comment"] == ""

    def test_quoted_values_stripped(self, client, runtime_paths):
        ws_id = "f" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / ".env.example").write_text('SECRET="my secret"\n')

        resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            params={"template_path": ".env.example"},
        )
        body = resp.json()
        assert body["template_variables"][0]["value"] == "my secret"

    def test_subdirectory_template_target_path(self, client, runtime_paths):
        ws_id = "1" * 32
        ws_path: Path = runtime_paths["workspaces"] / ws_id
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "backend").mkdir()
        (ws_path / "backend" / ".env.sample").write_text("PORT=3000\n")

        resp = client.get(
            f"/api/v1/images/git/workspace/{ws_id}/env",
            params={"template_path": "backend/.env.sample"},
        )
        body = resp.json()
        assert body["target_path"] == "backend/.env"
