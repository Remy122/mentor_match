import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    html: str,
    reply_to: str | None = None,
) -> bool:
    if not settings.resend_api_key:
        return False

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

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPError:
        logger.exception("Could not deliver email to %s", to_email)
        return False

    return True
