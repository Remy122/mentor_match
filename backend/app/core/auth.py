from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.supabase import get_supabase_client


class AuthUser(BaseModel):
    id: str
    email: str | None = None
    claims: dict[str, Any] = {}


def _issuer() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1"


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{_issuer()}/.well-known/jwks.json")


def _decode_bearer_token(token: str) -> dict[str, Any]:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL is not configured.",
        )

    try:
        token_header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed access token.",
        ) from exc

    alg = token_header.get("alg")
    common_options = {"verify_aud": False}

    # Legacy shared-secret projects.
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SUPABASE_JWT_SECRET is not configured.",
            )
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                issuer=_issuer(),
                options=common_options,
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
            ) from exc

    # Asymmetric signing keys (current Supabase default).
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "EdDSA"],
            issuer=_issuer(),
            options=common_options,
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
        ) from exc


def require_auth(authorization: str | None = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token.",
        )

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token cannot be empty.",
        )

    claims = _decode_bearer_token(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim.",
        )

    return AuthUser(id=user_id, email=claims.get("email"), claims=claims)


def require_admin_role(current_user: AuthUser = Depends(require_auth)) -> AuthUser:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select("role,approval_status")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )
    profile = result.data[0] if result.data else None

    if not profile or profile.get("role") != "admin" or profile.get("approval_status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )

    return current_user
