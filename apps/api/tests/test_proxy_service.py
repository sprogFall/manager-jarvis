import pytest

from app.services.proxy_service import build_proxy_env, normalize_proxy_url


class TestProxyService:
    def test_normalize_proxy_url_auto_prefix_http(self):
        assert normalize_proxy_url('127.0.0.1:7890') == 'http://127.0.0.1:7890'

    def test_normalize_proxy_url_empty_value(self):
        assert normalize_proxy_url('') is None

    def test_normalize_proxy_url_rejects_unsupported_scheme(self):
        with pytest.raises(ValueError, match='Unsupported proxy scheme'):
            normalize_proxy_url('ftp://127.0.0.1:21')

    def test_build_proxy_env_sets_http_and_https(self):
        env = build_proxy_env({'PATH': '/bin'}, 'http://127.0.0.1:7890')

        assert env['HTTP_PROXY'] == 'http://127.0.0.1:7890'
        assert env['HTTPS_PROXY'] == 'http://127.0.0.1:7890'
        assert env['http_proxy'] == 'http://127.0.0.1:7890'
        assert env['https_proxy'] == 'http://127.0.0.1:7890'
