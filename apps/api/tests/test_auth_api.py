from sqlalchemy import desc, select

from app.models.audit_log import AuditLog


class TestAuthAPI:
    def test_login_success_and_me(self, raw_client):
        login_resp = raw_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123456"},
        )
        assert login_resp.status_code == 200
        data = login_resp.json()
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["token_type"] == "bearer"

        me_resp = raw_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert me_resp.status_code == 200
        me = me_resp.json()
        assert me["username"] == "admin"
        assert me["is_admin"] is True

    def test_login_failure_writes_failed_audit(self, raw_client, db_session):
        resp = raw_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "wrong-password"},
        )
        assert resp.status_code == 401

        stmt = select(AuditLog).where(AuditLog.action == "auth.login").order_by(desc(AuditLog.id))
        record = db_session.scalar(stmt)
        assert record is not None
        assert record.status == "failed"

    def test_refresh_token(self, raw_client):
        login_resp = raw_client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123456"},
        )
        assert login_resp.status_code == 200
        refresh_token = login_resp.json()["refresh_token"]

        refresh_resp = raw_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert refresh_resp.status_code == 200
        data = refresh_resp.json()
        assert data["access_token"]
        assert data["refresh_token"]
