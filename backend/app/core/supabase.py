from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    if not settings.supabase_url:
        raise ValueError("SUPABASE_URL is required.")

    key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not key:
        raise ValueError("Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.")

    return create_client(settings.supabase_url, key)
