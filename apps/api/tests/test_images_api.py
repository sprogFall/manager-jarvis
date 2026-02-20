from app.services.docker_service import DockerService


class TestImagesAPI:
    def test_list_images(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "list_images",
            lambda self: [
                {
                    "id": "sha256:abc",
                    "tags": ["nginx:latest"],
                    "size": 123,
                    "created": "2026-01-01T00:00:00Z",
                }
            ],
        )

        resp = client.get("/api/v1/images")
        assert resp.status_code == 200
        assert resp.json()[0]["tags"] == ["nginx:latest"]

    def test_pull_image_enqueue_task(self, client, fake_task_manager):
        resp = client.post("/api/v1/images/pull", json={"image": "nginx", "tag": "latest"})
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert fake_task_manager.records[task_id].task_type == "image.pull"

    def test_delete_image_requires_confirmation(self, client):
        resp = client.delete("/api/v1/images/nginx:latest")
        assert resp.status_code == 400

    def test_delete_image_success(self, client, monkeypatch):
        monkeypatch.setattr(
            DockerService,
            "remove_image",
            lambda self, image, force=False, noprune=False: [{"Deleted": image}],
        )

        resp = client.delete("/api/v1/images/nginx:latest", params={"confirm": True, "force": True})
        assert resp.status_code == 200
        assert resp.json()["deleted"][0]["Deleted"] == "nginx:latest"

    def test_build_requires_path_or_git(self, client):
        resp = client.post("/api/v1/images/build", json={"tag": "demo:latest"})
        assert resp.status_code == 400

    def test_build_image_enqueue_task(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/build",
            params={"confirm": True},
            json={"tag": "demo:latest", "path": "/tmp/project", "no_cache": True},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert fake_task_manager.records[task_id].task_type == "image.build"

    def test_build_upload_enqueue_task(self, client, fake_task_manager, monkeypatch, runtime_paths):
        async def fake_save_upload_temp(self, upload):
            target = runtime_paths["uploads"] / "context.tar"
            target.write_bytes(b"fake-context")
            return target

        monkeypatch.setattr(DockerService, "save_upload_temp", fake_save_upload_temp)

        resp = client.post(
            "/api/v1/images/build/upload",
            files={"file": ("context.tar", b"fake", "application/x-tar")},
            data={"tag": "upload:latest", "dockerfile": "Dockerfile", "no_cache": "false", "pull": "false"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert fake_task_manager.records[task_id].task_type == "image.build.upload"

    def test_load_image_enqueue_task(self, client, fake_task_manager, monkeypatch, runtime_paths):
        async def fake_save_upload_temp(self, upload):
            target = runtime_paths["uploads"] / "image.tar"
            target.write_bytes(b"fake-image")
            return target

        monkeypatch.setattr(DockerService, "save_upload_temp", fake_save_upload_temp)

        resp = client.post(
            "/api/v1/images/load",
            files={"file": ("image.tar", b"tar-bytes", "application/x-tar")},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        assert fake_task_manager.records[task_id].task_type == "image.load"

    def test_save_image_enqueue_task(self, client, fake_task_manager):
        resp = client.post(
            "/api/v1/images/save",
            json={"image": "nginx:latest", "filename": "backup.tar"},
        )
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]
        record = fake_task_manager.records[task_id]
        assert record.task_type == "image.save"
        assert record.params["filename"] == "backup.tar"

    def test_download_export_file(self, client, runtime_paths):
        export_file = runtime_paths["exports"] / "demo.tar"
        export_file.write_bytes(b"demo-content")

        resp = client.get("/api/v1/images/exports/demo.tar")
        assert resp.status_code == 200
        assert resp.content == b"demo-content"

    def test_download_export_missing(self, client):
        resp = client.get("/api/v1/images/exports/not-found.tar")
        assert resp.status_code == 404
