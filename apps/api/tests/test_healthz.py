from app.services.docker_service import DockerService


class TestHealthz:
    def test_healthz_ok(self, raw_client, monkeypatch):
        monkeypatch.setattr(DockerService, "ping", lambda self: True)

        resp = raw_client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "docker": True}
