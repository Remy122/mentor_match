from datetime import datetime, timezone
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, status

from app.core.config import settings
from app.core.auth import AuthUser, require_auth, _decode_bearer_token
from app.core.profiles import get_profile, get_role_profile
from app.core.supabase import get_supabase_client
from app.core.universities import (
    UNIVERSITY_NOT_SELECTED,
    normalize_ontario_postsecondary_institution,
)
from app.schemas.auth import MeResponse, ProfileSyncRequest, ProfileUpdateRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_profile_or_404(user_id: str) -> dict[str, Any]:
    supabase = get_supabase_client()
    profile = get_profile(supabase, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return profile


def _get_role_profile(user_id: str, role: str) -> dict[str, Any] | None:
    supabase = get_supabase_client()
    return get_role_profile(supabase, user_id, role)


def _get_program_application(profile: dict[str, Any]) -> dict[str, Any] | None:
    application_id = profile.get("program_application_id")
    if not application_id:
        return None
    result = (
        get_supabase_client()
        .table("program_applications")
        .select(
            "id,application_type,preferred_name,caregiving_situation,"
            "support_requested,communication_preference"
        )
        .eq("id", application_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _ensure_username_available(
    supabase: Any,
    username: str,
    user_id: str,
) -> str:
    normalized = username.strip()
    result = supabase.table("profiles").select("id,username").execute()
    for profile in result.data or []:
        existing = profile.get("username")
        if existing and existing.lower() == normalized.lower() and profile.get("id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That username is already in use.",
            )
    return normalized


def _validate_university(university: str, *, allow_unaffiliated: bool = False) -> str:
    if allow_unaffiliated and university.strip() in {"", UNIVERSITY_NOT_SELECTED}:
        return UNIVERSITY_NOT_SELECTED
    normalized = normalize_ontario_postsecondary_institution(university)
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Select a valid Ontario post-secondary institution.",
        )
    return normalized


@router.post("/sync-profile", response_model=MeResponse)
def sync_profile(payload: ProfileSyncRequest, current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    supabase = get_supabase_client()

    existing_profile = get_profile(supabase, current_user.id)

    metadata_role = None
    raw_user_metadata = current_user.claims.get("user_metadata")
    if isinstance(raw_user_metadata, dict):
        role_value = raw_user_metadata.get("role")
        if isinstance(role_value, str):
            metadata_role = role_value.strip().lower()

    if existing_profile:
        desired_role = existing_profile.get("role") or "mentee"
    else:
        desired_role = payload.role or metadata_role or "mentee"
    if desired_role not in {"admin", "mentor", "mentee"}:
        desired_role = "mentee"

    profile_fields: dict[str, Any] = {
        "id": current_user.id,
        "role": desired_role,
    }
    metadata_username = None
    if isinstance(raw_user_metadata, dict):
        metadata_username = raw_user_metadata.get("username")
    requested_username = payload.username or metadata_username
    if requested_username and isinstance(requested_username, str):
        profile_fields["username"] = _ensure_username_available(
            supabase,
            requested_username,
            current_user.id,
        )
    metadata_full_name = None
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
    if payload.same_university_only is not None and desired_role == "mentor":
        profile_fields["same_university_only"] = payload.same_university_only

    metadata_university = None
    if isinstance(raw_user_metadata, dict):
        metadata_university = raw_user_metadata.get("university")
    requested_university = payload.university or metadata_university
    if requested_university and isinstance(requested_university, str):
        profile_fields["university"] = _validate_university(
            requested_university,
            allow_unaffiliated=desired_role == "mentee",
        )

    if not existing_profile:
        profile_fields["approval_status"] = "pending"
        profile_fields.setdefault("is_visible", False)

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
        application=_get_program_application(profile),
    )


@router.get("/me", response_model=MeResponse)
def get_me(current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    profile = _get_profile_or_404(current_user.id)
    return MeResponse(
        profile=profile,
        mentor_profile=_get_role_profile(current_user.id, "mentor") if profile["role"] == "mentor" else None,
        mentee_profile=_get_role_profile(current_user.id, "mentee") if profile["role"] == "mentee" else None,
        application=_get_program_application(profile),
    )


@router.post("/complete-invitation", response_model=MeResponse)
def complete_invitation(current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    supabase = get_supabase_client()
    profile = _get_profile_or_404(current_user.id)
    if profile.get("account_status") == "invited":
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("profiles").update(
            {"account_status": "active", "stage_started_at": now}
        ).eq("id", current_user.id).execute()
        application_id = profile.get("program_application_id")
        if application_id:
            supabase.table("program_applications").update(
                {"onboarding_status": profile.get("onboarding_status") or "profile_pending"}
            ).eq("id", application_id).execute()
        profile = _get_profile_or_404(current_user.id)
    return MeResponse(
        profile=profile,
        mentor_profile=_get_role_profile(current_user.id, "mentor") if profile["role"] == "mentor" else None,
        mentee_profile=_get_role_profile(current_user.id, "mentee") if profile["role"] == "mentee" else None,
        application=_get_program_application(profile),
    )


@router.patch("/me", response_model=MeResponse)
def update_me(payload: ProfileUpdateRequest, current_user: AuthUser = Depends(require_auth)) -> MeResponse:
    supabase = get_supabase_client()
    profile = _get_profile_or_404(current_user.id)
    target_role = profile["role"]

    profile_updates: dict[str, Any] = {}
    if payload.username is not None:
        profile_updates["username"] = _ensure_username_available(
            supabase,
            payload.username,
            current_user.id,
        )
    if payload.full_name is not None:
        profile_updates["full_name"] = payload.full_name
    if payload.bio is not None:
        profile_updates["bio"] = payload.bio
    if payload.profile_picture_url is not None:
        profile_updates["profile_picture_url"] = payload.profile_picture_url
    if payload.university is not None:
        if target_role == "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin university assignments are managed by the super-admin.",
            )
        profile_updates["university"] = _validate_university(
            payload.university,
            allow_unaffiliated=target_role == "mentee",
        )

    if payload.bio is not None and payload.bio.strip():
        profile_updates["account_status"] = "active"
        if target_role == "mentee" and profile.get("onboarding_status") == "profile_pending":
            profile_updates["onboarding_status"] = "ready"
            profile_updates["approval_status"] = "approved"

    if payload.is_visible is not None:
        if target_role != "mentor":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only mentors can change visibility.",
            )
        profile_updates["is_visible"] = payload.is_visible

    if payload.same_university_only is not None:
        if target_role != "mentor":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only mentors can change profile audience settings.",
            )
        profile_updates["same_university_only"] = payload.same_university_only

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
        application=_get_program_application(refreshed),
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
