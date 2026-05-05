from datetime import datetime, timezone
from typing import Any, Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.auth import AuthUser, require_auth, _decode_bearer_token
from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/auth", tags=["auth"])


class ProfileSyncRequest(BaseModel):
    role: Literal["mentor", "mentee"] | None = None
    full_name: str | None = None
    bio: str | None = None
    profile_picture_url: str | None = None
    skills: list[str] | None = None
    availability: str | None = None
    goals: str | None = None
    interests: list[str] | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    profile_picture_url: str | None = None
    is_visible: bool | None = None
    skills: list[str] | None = None
    availability: str | None = None
    goals: str | None = None
    interests: list[str] | None = None


class MeResponse(BaseModel):
    profile: dict[str, Any]
    mentor_profile: dict[str, Any] | None = None
    mentee_profile: dict[str, Any] | None = None


def _get_profile_or_404(user_id: str) -> dict[str, Any]:
    supabase = get_supabase_client()
    result = supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return result.data[0]


def _get_role_profile(user_id: str, role: str) -> dict[str, Any] | None:
    supabase = get_supabase_client()
    if role == "mentor":
        result = supabase.table("mentor_profiles").select("*").eq("id", user_id).limit(1).execute()
        return result.data[0] if result.data else None

    if role == "mentee":
        result = supabase.table("mentee_profiles").select("*").eq("id", user_id).limit(1).execute()
        return result.data[0] if result.data else None

    return None


@router.post("/sync-profile", response_model=MeResponse)
def sync_profile(payload: ProfileSyncRequest, current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    supabase = get_supabase_client()

    existing = supabase.table("profiles").select("*").eq("id", current_user.id).limit(1).execute()
    existing_profile = existing.data[0] if existing.data else None

    desired_role = payload.role or (existing_profile.get("role") if existing_profile else "mentee")
    if desired_role not in {"mentor", "mentee"}:
        desired_role = "mentee"

    profile_fields: dict[str, Any] = {
        "id": current_user.id,
        "role": desired_role,
    }
    metadata_full_name = None
    raw_user_metadata = current_user.claims.get("user_metadata")
    if isinstance(raw_user_metadata, dict):
        metadata_full_name = raw_user_metadata.get("full_name")
    email_default_name = (
        current_user.email.split("@")[0] if current_user.email and "@" in current_user.email else None
    )

    if payload.full_name is not None:
        profile_fields["full_name"] = payload.full_name
    elif metadata_full_name and isinstance(metadata_full_name, str) and metadata_full_name.strip():
        profile_fields["full_name"] = metadata_full_name.strip()
    elif email_default_name:
        profile_fields["full_name"] = email_default_name
    elif not existing_profile:
        profile_fields["full_name"] = "New User"

    if payload.bio is not None:
        profile_fields["bio"] = payload.bio
    if payload.profile_picture_url is not None:
        profile_fields["profile_picture_url"] = payload.profile_picture_url

    if not existing_profile:
        profile_fields["approval_status"] = "pending"
        profile_fields.setdefault("is_visible", desired_role == "mentor")

    supabase.table("profiles").upsert(profile_fields).execute()

    if desired_role == "mentor":
        mentor_payload: dict[str, Any] = {"id": current_user.id}
        if payload.skills is not None:
            mentor_payload["skills"] = payload.skills
        if payload.availability is not None:
            mentor_payload["availability"] = payload.availability
        supabase.table("mentor_profiles").upsert(mentor_payload).execute()

    if desired_role == "mentee":
        mentee_payload: dict[str, Any] = {"id": current_user.id}
        if payload.goals is not None:
            mentee_payload["goals"] = payload.goals
        if payload.interests is not None:
            mentee_payload["interests"] = payload.interests
        supabase.table("mentee_profiles").upsert(mentee_payload).execute()

    profile = _get_profile_or_404(current_user.id)
    return MeResponse(
        profile=profile,
        mentor_profile=_get_role_profile(current_user.id, "mentor") if profile["role"] == "mentor" else None,
        mentee_profile=_get_role_profile(current_user.id, "mentee") if profile["role"] == "mentee" else None,
    )


@router.get("/me", response_model=MeResponse)
def get_me(current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    profile = _get_profile_or_404(current_user.id)
    return MeResponse(
        profile=profile,
        mentor_profile=_get_role_profile(current_user.id, "mentor") if profile["role"] == "mentor" else None,
        mentee_profile=_get_role_profile(current_user.id, "mentee") if profile["role"] == "mentee" else None,
    )


@router.patch("/me", response_model=MeResponse)
def update_me(payload: ProfileUpdateRequest, current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    supabase = get_supabase_client()
    profile = _get_profile_or_404(current_user.id)
    target_role = profile["role"]

    profile_updates: dict[str, Any] = {}
    if payload.full_name is not None:
        profile_updates["full_name"] = payload.full_name
    if payload.bio is not None:
        profile_updates["bio"] = payload.bio
    if payload.profile_picture_url is not None:
        profile_updates["profile_picture_url"] = payload.profile_picture_url

    if payload.is_visible is not None:
        if target_role != "mentor":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only mentors can change visibility.",
            )
        profile_updates["is_visible"] = payload.is_visible

    if profile_updates:
        supabase.table("profiles").update(profile_updates).eq("id", current_user.id).execute()

    if target_role == "mentor":
        mentor_updates: dict[str, Any] = {}
        if payload.skills is not None:
            mentor_updates["skills"] = payload.skills
        if payload.availability is not None:
            mentor_updates["availability"] = payload.availability
        mentor_updates["id"] = current_user.id
        supabase.table("mentor_profiles").upsert(mentor_updates).execute()

    if target_role == "mentee":
        mentee_updates: dict[str, Any] = {}
        if payload.goals is not None:
            mentee_updates["goals"] = payload.goals
        if payload.interests is not None:
            mentee_updates["interests"] = payload.interests
        mentee_updates["id"] = current_user.id
        supabase.table("mentee_profiles").upsert(mentee_updates).execute()

    refreshed = _get_profile_or_404(current_user.id)
    return MeResponse(
        profile=refreshed,
        mentor_profile=_get_role_profile(current_user.id, "mentor") if refreshed["role"] == "mentor" else None,
        mentee_profile=_get_role_profile(current_user.id, "mentee") if refreshed["role"] == "mentee" else None,
    )


@router.get("/debug-token")
def debug_token(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    # Dev helper only: use this endpoint to diagnose JWT issues quickly.
    if settings.app_env.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found.",
        )

    if not authorization or not authorization.startswith("Bearer "):
        return {
            "ok": False,
            "reason": "missing_bearer_token",
            "hint": "Send Authorization: Bearer <access_token>",
        }

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return {
            "ok": False,
            "reason": "empty_bearer_token",
        }

    result: dict[str, Any] = {
        "ok": False,
        "reason": "unknown",
        "token_preview": f"{token[:12]}...{token[-6:]}" if len(token) > 18 else token,
    }

    try:
        unverified_claims = jwt.decode(
            token,
            options={"verify_signature": False, "verify_exp": False, "verify_aud": False},
            algorithms=["HS256"],
        )
        result["sub"] = unverified_claims.get("sub")
        result["email"] = unverified_claims.get("email")
        exp = unverified_claims.get("exp")
        if exp:
            result["exp"] = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
    except jwt.PyJWTError:
        result["reason"] = "malformed_token"
        return result

    try:
        claims = _decode_bearer_token(token)
        result["ok"] = True
        result["reason"] = "token_valid"
        result["sub"] = claims.get("sub")
        result["email"] = claims.get("email")
        result["iss"] = claims.get("iss")
        result["alg"] = (jwt.get_unverified_header(token) or {}).get("alg")
        return result
    except HTTPException as exc:
        message = str(exc.detail).lower()
        if "expired" in message:
            result["reason"] = "token_expired"
        elif "supabase_jwt_secret" in message:
            result["reason"] = "missing_server_jwt_secret"
            result["hint"] = "For HS256 projects set SUPABASE_JWT_SECRET."
        elif "supabase_url" in message:
            result["reason"] = "missing_supabase_url"
        elif "malformed" in message:
            result["reason"] = "malformed_token"
        else:
            result["reason"] = "signature_mismatch_or_invalid"
            result["hint"] = (
                "If using asymmetric JWT keys, keep SUPABASE_URL correct; "
                "if using HS256, verify SUPABASE_JWT_SECRET."
            )
        return result
