from sqlalchemy import desc, select

from app.models.audit_log import AuditLog


class TestSystemProxyAPI:
    def test_get_proxy_default_none(self, client):
        resp = client.get('/api/v1/system/proxy')
        assert resp.status_code == 200
        assert resp.json() == {'proxy_url': None}

    def test_update_proxy_and_get(self, client, db_session):
        resp = client.put('/api/v1/system/proxy', json={'proxy_url': 'http://127.0.0.1:7890'})
        assert resp.status_code == 200
        assert resp.json() == {'proxy_url': 'http://127.0.0.1:7890'}

        get_resp = client.get('/api/v1/system/proxy')
        assert get_resp.status_code == 200
        assert get_resp.json() == {'proxy_url': 'http://127.0.0.1:7890'}

        stmt = select(AuditLog).where(AuditLog.action == 'system.proxy.update').order_by(desc(AuditLog.id))
        record = db_session.scalar(stmt)
        assert record is not None
        assert record.detail == {'proxy_url': 'http://127.0.0.1:7890'}

    def test_clear_proxy_url(self, client):
        set_resp = client.put('/api/v1/system/proxy', json={'proxy_url': 'http://127.0.0.1:7890'})
        assert set_resp.status_code == 200

        clear_resp = client.put('/api/v1/system/proxy', json={'proxy_url': None})
        assert clear_resp.status_code == 200
        assert clear_resp.json() == {'proxy_url': None}

    def test_update_proxy_rejects_unsupported_scheme(self, client):
        resp = client.put('/api/v1/system/proxy', json={'proxy_url': 'ftp://127.0.0.1:21'})
        assert resp.status_code == 400
        assert 'Unsupported proxy scheme' in resp.json()['detail']
