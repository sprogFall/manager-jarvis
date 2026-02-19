import pytest
from fastapi import HTTPException

from app.utils.confirm import check_confirmation


class TestConfirmUtils:
    def test_confirmation_passes_with_flag(self):
        check_confirmation(True, "danger-action", None)

    def test_confirmation_passes_with_header(self):
        check_confirmation(False, "danger-action", "yes")

    def test_confirmation_rejects(self):
        with pytest.raises(HTTPException) as exc:
            check_confirmation(False, "danger-action", None)
        assert exc.value.status_code == 400
        assert "requires secondary confirmation" in str(exc.value.detail)
