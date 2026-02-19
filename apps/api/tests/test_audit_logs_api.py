from datetime import datetime, timezone

from app.models.audit_log import AuditLog


class TestAuditLogsAPI:
    def test_list_audit_logs(self, client, db_session):
        db_session.add(
            AuditLog(
                user_id=1,
                username="admin",
                action="container.start",
                resource_type="container",
                resource_id="c1",
                status="success",
                detail={"k": "v"},
                created_at=datetime.now(timezone.utc),
            )
        )
        db_session.commit()

        resp = client.get("/api/v1/audit-logs")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["action"] == "container.start"

    def test_filter_audit_logs(self, client, db_session):
        now = datetime.now(timezone.utc)
        db_session.add_all(
            [
                AuditLog(
                    user_id=1,
                    username="admin",
                    action="image.pull",
                    resource_type="image",
                    resource_id="nginx:latest",
                    status="success",
                    detail=None,
                    created_at=now,
                ),
                AuditLog(
                    user_id=1,
                    username="admin",
                    action="container.restart",
                    resource_type="container",
                    resource_id="c2",
                    status="success",
                    detail=None,
                    created_at=now,
                ),
            ]
        )
        db_session.commit()

        resp = client.get("/api/v1/audit-logs", params={"action": "image.pull", "resource_type": "image"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["action"] == "image.pull"
        assert data[0]["resource_type"] == "image"
