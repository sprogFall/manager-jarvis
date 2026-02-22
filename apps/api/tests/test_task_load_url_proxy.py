import pytest

from app.services.task_service import task_load_image_from_url


def test_task_load_image_from_url_rejects_socks_proxy(monkeypatch):
    import app.services.proxy_service as proxy_service

    monkeypatch.setattr(proxy_service, "get_runtime_proxy_url", lambda: "socks5h://127.0.0.1:7890")

    with pytest.raises(ValueError) as exc:
        task_load_image_from_url({"url": "https://example.com/releases/image.tar"})

    assert "socks" in str(exc.value).lower()

