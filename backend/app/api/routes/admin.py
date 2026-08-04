from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, require_admin_role
from app.core.profiles import get_profile, get_profiles_by_ids
from app.core.supabase import get_supabase_client
from app.core.universities import UNIVERSITY_NOT_SELECTED, normalize_ontario_university
from app.schemas.admin import (
    AdminProfileCreate,
    AdminProfileUpdate,
    PreapprovedEmailCreate,
)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_USER_COLUMNS = (
    "id,role,username,full_name,bio,university,approval_status,is_visible,"
    "same_university_only,is_super_admin,created_at,"
    "mentor_profiles(availability,total_hours),"
    "mentee_profiles(goals,interests)"
)


def _validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Enter a valid email address.",
        )
    return normalized


def _scoped_university(admin_user: AuthUser, requested: str | None = None) -> str:
    if admin_user.is_super_admin:
        normalized = normalize_ontario_university(requested)
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Select a valid Ontario university.",
            )
        return normalized

    if not admin_user.university or admin_user.university == UNIVERSITY_NOT_SELECTED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your admin account must have an Ontario university.",
        )
    if requested and requested != admin_user.university:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Normal admins can only manage their own university.",
        )
    return admin_user.university


def _scope_profile_query(query: Any, admin_user: AuthUser) -> Any:
    if admin_user.is_super_admin:
        return query
    university = _scoped_university(admin_user)
    return query.eq("university", university).in_("role", ["mentor", "mentee"])


def _get_managed_profile(
    supabase: Any,
    user_id: str,
    admin_user: AuthUser,
) -> dict[str, Any]:
    profile = get_profile(supabase, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if admin_user.is_super_admin:
        return profile
    if profile.get("role") == "admin" or profile.get("university") != admin_user.university:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return profile


def _ensure_username_available(supabase: Any, username: str, user_id: str | None = None) -> str:
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


def _member_profile_payload(payload: AdminProfileCreate | AdminProfileUpdate) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    return {
        key: values[key]
        for key in ("goals", "interests", "availability")
        if key in values
    }


@router.get("/pending-users")
def get_pending_users(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = (
        supabase.table("profiles")
        .select(ADMIN_USER_COLUMNS)
        .eq("approval_status", "pending")
        .in_("role", ["mentor", "mentee"])
    )
    result = _scope_profile_query(query, admin_user).order("created_at", desc=False).execute()
    return {"pending_users": result.data or []}


@router.get("/reviewed-users")
def get_reviewed_users(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = (
        supabase.table("profiles")
        .select(ADMIN_USER_COLUMNS)
        .in_("approval_status", ["approved", "rejected"])
        .in_("role", ["mentor", "mentee"])
    )
    result = _scope_profile_query(query, admin_user).order("created_at", desc=True).execute()
    return {"reviewed_users": result.data or []}


@router.get("/users")
def get_admin_users(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = supabase.table("profiles").select(ADMIN_USER_COLUMNS)
    result = _scope_profile_query(query, admin_user).order("created_at", desc=True).execute()
    users = result.data or []
    if not admin_user.is_super_admin:
        users = [user for user in users if user.get("role") in {"mentor", "mentee"}]
    return {"users": users}


@router.post("/users")
def create_admin_managed_profile(
    payload: AdminProfileCreate,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    if payload.role == "admin" and not admin_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the super-admin can create admin accounts.",
        )

    email = _validate_email(payload.email)
    university = _scoped_university(admin_user, payload.university)
    username = _ensure_username_available(supabase, payload.username)
    approval_status = "approved" if payload.role == "admin" else payload.approval_status
    is_visible = payload.is_visible if payload.role == "mentor" and approval_status == "approved" else False

    try:
        created = supabase.auth.admin.create_user(
            {
                "email": email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "role": payload.role,
                    "username": username,
                    "full_name": payload.full_name,
                    "bio": payload.bio,
                    "university": university,
                    "availability": payload.availability,
                    "goals": payload.goals,
                    "interests": payload.interests or [],
                },
            }
        )
        created_user = getattr(created, "user", None)
        user_id = str(getattr(created_user, "id", ""))
        if not user_id:
            raise RuntimeError("Supabase did not return the created user.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create account: {exc}",
        ) from exc

    profile_payload = {
        "id": user_id,
        "role": payload.role,
        "username": username,
        "full_name": payload.full_name,
        "bio": payload.bio,
        "university": university,
        "approval_status": approval_status,
        "is_visible": is_visible,
        "same_university_only": payload.same_university_only,
        "is_super_admin": False,
    }

    try:
        supabase.table("profiles").upsert(profile_payload).execute()
        if payload.role == "mentor":
            supabase.table("mentor_profiles").upsert(
                {"id": user_id, "skills": None, "availability": payload.availability}
            ).execute()
            supabase.table("mentee_profiles").delete().eq("id", user_id).execute()
        elif payload.role == "mentee":
            supabase.table("mentee_profiles").upsert(
                {
                    "id": user_id,
                    "goals": payload.goals,
                    "interests": payload.interests or [],
                }
            ).execute()
            supabase.table("mentor_profiles").delete().eq("id", user_id).execute()
        else:
            supabase.table("mentor_profiles").delete().eq("id", user_id).execute()
            supabase.table("mentee_profiles").delete().eq("id", user_id).execute()
    except Exception as exc:
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The auth account was rolled back because its profile could not be created.",
        ) from exc

    return {
        "message": "Account and profile created.",
        "email": email,
        "profile": get_profile(supabase, user_id),
    }


@router.patch("/users/{user_id}")
def update_admin_managed_profile(
    user_id: str,
    payload: AdminProfileUpdate,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    existing = _get_managed_profile(supabase, user_id, admin_user)
    target_role = payload.role or existing.get("role")

    if target_role == "admin" and not admin_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the super-admin can manage admin accounts.",
        )
    if existing.get("is_super_admin") and target_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The designated super-admin must remain an admin.",
        )

    updates: dict[str, Any] = {}
    values = payload.model_dump(exclude_unset=True)
    for key in ("full_name", "bio", "approval_status"):
        if key in values:
            updates[key] = values[key]
    if payload.username is not None:
        updates["username"] = _ensure_username_available(supabase, payload.username, user_id)
    if payload.university is not None:
        updates["university"] = _scoped_university(admin_user, payload.university)
    elif not admin_user.is_super_admin:
        updates["university"] = _scoped_university(admin_user)
    if payload.role is not None:
        updates["role"] = target_role

    if target_role == "admin":
        updates["approval_status"] = "approved"

    if target_role == "mentor":
        if payload.is_visible is not None:
            updates["is_visible"] = payload.is_visible
        if payload.same_university_only is not None:
            updates["same_university_only"] = payload.same_university_only
    else:
        updates["is_visible"] = False

    if updates:
        supabase.table("profiles").update(updates).eq("id", user_id).execute()

    role_values = _member_profile_payload(payload)
    if target_role == "mentor" and (
        "availability" in role_values or existing.get("role") != "mentor"
    ):
        mentor_payload = {"id": user_id, "skills": None}
        if "availability" in role_values:
            mentor_payload["availability"] = role_values["availability"]
        supabase.table("mentor_profiles").upsert(mentor_payload).execute()
        supabase.table("mentee_profiles").delete().eq("id", user_id).execute()
    elif target_role == "mentee":
        mentee_payload = {"id": user_id}
        if "goals" in role_values:
            mentee_payload["goals"] = role_values["goals"]
        if "interests" in role_values:
            mentee_payload["interests"] = role_values["interests"]
        supabase.table("mentee_profiles").upsert(mentee_payload).execute()
        supabase.table("mentor_profiles").delete().eq("id", user_id).execute()
    else:
        supabase.table("mentor_profiles").delete().eq("id", user_id).execute()
        supabase.table("mentee_profiles").delete().eq("id", user_id).execute()

    return {
        "message": "Profile updated.",
        "profile": get_profile(supabase, user_id),
    }


@router.get("/preapproved-emails")
def get_preapproved_emails(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = supabase.table("preapproved_emails").select("*")
    if not admin_user.is_super_admin:
        query = query.eq("university", _scoped_university(admin_user))
    result = query.order("created_at", desc=True).execute()
    return {"preapproved_emails": result.data or []}


@router.post("/preapproved-emails")
def create_preapproved_email(
    payload: PreapprovedEmailCreate,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    email = _validate_email(payload.email)
    university = _scoped_university(admin_user, payload.university)

    existing = supabase.table("preapproved_emails").select("id,email").execute()
    if any((row.get("email") or "").lower() == email for row in (existing.data or [])):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is already preapproved.",
        )

    result = (
        supabase.table("preapproved_emails")
        .insert(
            {
                "email": email,
                "role": payload.role,
                "university": university,
                "created_by": admin_user.id,
            }
        )
        .execute()
    )
    return {
        "message": "Email preapproved.",
        "preapproved_email": (result.data or [None])[0],
    }


@router.delete("/preapproved-emails/{entry_id}")
def delete_preapproved_email(
    entry_id: str,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, str]:
    supabase = get_supabase_client()
    result = (
        supabase.table("preapproved_emails")
        .select("id,university")
        .eq("id", entry_id)
        .limit(1)
        .execute()
    )
    entry = result.data[0] if result.data else None
    if not entry or (
        not admin_user.is_super_admin and entry.get("university") != admin_user.university
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    supabase.table("preapproved_emails").delete().eq("id", entry_id).execute()
    return {"message": "Preapproved email removed."}


@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: str,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, str]:
    supabase = get_supabase_client()
    profile = _get_managed_profile(supabase, user_id, admin_user)
    role = profile.get("role")
    university = profile.get("university")
    if role in {"mentor", "mentee"} and (
        not university or university == UNIVERSITY_NOT_SELECTED
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The applicant must select an Ontario university before approval.",
        )

    supabase.table("profiles").update(
        {
            "approval_status": "approved",
            "is_visible": role == "mentor",
        }
    ).eq("id", user_id).execute()
    return {"message": f"Approved user {user_id}."}


@router.post("/users/{user_id}/reject")
def reject_user(
    user_id: str,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, str]:
    supabase = get_supabase_client()
    _get_managed_profile(supabase, user_id, admin_user)
    supabase.table("profiles").update(
        {
            "approval_status": "rejected",
            "is_visible": False,
        }
    ).eq("id", user_id).execute()
    return {"message": f"Rejected user {user_id}."}


@router.post("/mentors/{mentor_id}/remove-access")
def remove_mentor_access(
    mentor_id: str,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, str]:
    supabase = get_supabase_client()
    mentor = _get_managed_profile(supabase, mentor_id, admin_user)
    if mentor.get("role") != "mentor":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found.")

    supabase.table("profiles").update(
        {
            "approval_status": "rejected",
            "is_visible": False,
        }
    ).eq("id", mentor_id).execute()
    supabase.table("matches").update({"status": "cancelled"}).eq(
        "mentor_id", mentor_id
    ).in_("status", ["pending", "active"]).execute()
    return {"message": f"Removed mentor access for {mentor_id}."}


@router.get("/dashboard")
def get_dashboard(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, float]:
    supabase = get_supabase_client()
    profile_result = _scope_profile_query(
        supabase.table("profiles").select("id,role,approval_status,university"),
        admin_user,
    ).execute()
    profiles = profile_result.data or []
    visible_ids = {profile["id"] for profile in profiles}

    matches_result = supabase.table("matches").select("id,mentor_id,mentee_id,status").execute()
    scoped_matches = [
        match
        for match in (matches_result.data or [])
        if match.get("mentor_id") in visible_ids and match.get("mentee_id") in visible_ids
    ]
    hours_result = supabase.table("volunteer_hours").select(
        "mentor_id,mentee_id,hours"
    ).execute()
    scoped_hours = [
        row
        for row in (hours_result.data or [])
        if row.get("mentor_id") in visible_ids and row.get("mentee_id") in visible_ids
    ]

    return {
        "active_mentors": float(
            sum(
                profile.get("role") == "mentor"
                and profile.get("approval_status") == "approved"
                for profile in profiles
            )
        ),
        "active_mentees": float(
            sum(
                profile.get("role") == "mentee"
                and profile.get("approval_status") == "approved"
                for profile in profiles
            )
        ),
        "current_matches": float(
            sum(match.get("status") == "active" for match in scoped_matches)
        ),
        "volunteer_hours_total": sum(
            float(row.get("hours") or 0) for row in scoped_hours
        ),
    }


@router.get("/matches")
def get_admin_matches(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status,care_type,created_at")
        .order("created_at", desc=True)
        .execute()
    )
    matches = result.data or []
    profile_ids = list(
        {
            row_id
            for match in matches
            for row_id in (match.get("mentor_id"), match.get("mentee_id"))
            if row_id
        }
    )
    profiles = get_profiles_by_ids(
        supabase,
        profile_ids,
        "id,username,full_name,university",
    )

    if not admin_user.is_super_admin:
        matches = [
            match
            for match in matches
            if profiles.get(match.get("mentor_id"), {}).get("university")
            == admin_user.university
            and profiles.get(match.get("mentee_id"), {}).get("university")
            == admin_user.university
        ]

    status_counts: dict[str, int] = {}
    enriched = []
    for match in matches:
        match_status = match.get("status") or "unknown"
        status_counts[match_status] = status_counts.get(match_status, 0) + 1
        enriched.append(
            {
                **match,
                "volunteer_profile": profiles.get(match.get("mentor_id")),
                "caregiver_profile": profiles.get(match.get("mentee_id")),
            }
        )
    return {"matches": enriched, "status_counts": status_counts}


@router.get("/mentors")
def get_admin_mentors(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = (
        supabase.table("profiles")
        .select(
            "id,username,full_name,bio,university,is_visible,"
            "same_university_only,approval_status,mentor_profiles(availability,total_hours)"
        )
        .eq("role", "mentor")
        .eq("approval_status", "approved")
    )
    result = _scope_profile_query(query, admin_user).order("created_at", desc=False).execute()
    return {"mentors": result.data or []}
