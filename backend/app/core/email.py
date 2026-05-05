from typing import Any

import httpx

from app.core.config import settings


def send_email(to_email: str, subject: str, html: str, reply_to: str | None = None) -> None:
    if not settings.resend_api_key:
        return

    payload: dict[str, Any] = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=10.0) as client:
        client.post("https://api.resend.com/emails", json=payload, headers=headers)
