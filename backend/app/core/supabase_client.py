from __future__ import annotations

from functools import lru_cache

from fastapi import HTTPException, status
from supabase import Client, create_client

from app.core.config import settings


def _require_env(name: str, value: str) -> str:
    if value:
        return value
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Missing required environment variable: {name}",
    )


@lru_cache
def get_service_client() -> Client:
    url = _require_env("SUPABASE_URL", settings.supabase_url)
    key = _require_env("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key)
    return create_client(url, key)

