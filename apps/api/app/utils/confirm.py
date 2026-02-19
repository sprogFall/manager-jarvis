from fastapi import Header, HTTPException, status


CONFIRM_HEADER_VALUE = "yes"


def check_confirmation(confirm: bool, action: str, header_value: str | None = None) -> None:
    if confirm:
        return
    if header_value and header_value.lower() == CONFIRM_HEADER_VALUE:
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Action '{action}' requires secondary confirmation: set confirm=true or X-Confirm-Action: yes",
    )


def confirmation_header(x_confirm_action: str | None = Header(default=None)) -> str | None:
    return x_confirm_action
