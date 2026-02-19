from app.main import settings


class TestFrontendStatic:
    def test_root_returns_404_when_frontend_dist_not_set(self, raw_client, monkeypatch):
        monkeypatch.setattr(settings, "frontend_dist_dir", "")

        resp = raw_client.get("/")
        assert resp.status_code == 404

    def test_serves_frontend_files_when_frontend_dist_exists(self, raw_client, monkeypatch, tmp_path):
        frontend_dist = tmp_path / "web-dist"
        (frontend_dist / "dashboard").mkdir(parents=True, exist_ok=True)
        (frontend_dist / "index.html").write_text("<html><body>home</body></html>", encoding="utf-8")
        (frontend_dist / "dashboard" / "index.html").write_text(
            "<html><body>dashboard</body></html>",
            encoding="utf-8",
        )
        (frontend_dist / "app.js").write_text("console.log('ok');", encoding="utf-8")
        monkeypatch.setattr(settings, "frontend_dist_dir", str(frontend_dist))

        root_resp = raw_client.get("/")
        assert root_resp.status_code == 200
        assert "home" in root_resp.text

        dashboard_resp = raw_client.get("/dashboard")
        assert dashboard_resp.status_code == 200
        assert "dashboard" in dashboard_resp.text

        asset_resp = raw_client.get("/app.js")
        assert asset_resp.status_code == 200
        assert asset_resp.text == "console.log('ok');"

    def test_unknown_api_path_keeps_404(self, raw_client, monkeypatch, tmp_path):
        frontend_dist = tmp_path / "web-dist"
        frontend_dist.mkdir(parents=True, exist_ok=True)
        (frontend_dist / "index.html").write_text("<html><body>home</body></html>", encoding="utf-8")
        monkeypatch.setattr(settings, "frontend_dist_dir", str(frontend_dist))

        resp = raw_client.get("/api/v1/not-found")
        assert resp.status_code == 404
