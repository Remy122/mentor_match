from datetime import datetime, timezone
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, require_admin_role
from app.core.profiles import get_auth_email, get_profile, get_profiles_by_ids
from app.core.supabase import get_supabase_client
from app.core.universities import (
    UNIVERSITY_NOT_SELECTED,
    normalize_ontario_postsecondary_institution,
)
from app.schemas.admin import (
    AdminProfileCreate,
    AdminProfileUpdate,
    AccountLifecycleUpdate,
    MatchStatusUpdate,
    PreapprovedEmailCreate,
)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_USER_COLUMNS = (
    "id,role,username,full_name,legal_name,preferred_name,phone_number,bio,"
    "university,approval_status,is_visible,same_university_only,is_super_admin,"
    "program_application_id,account_status,onboarding_status,assigned_coordinator,"
    "stage_started_at,suspended_at,created_at,"
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
        normalized = normalize_ontario_postsecondary_institution(requested)
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Select a valid Ontario post-secondary institution.",
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


def _scope_program_application_query(query: Any, admin_user: AuthUser) -> Any:
    if admin_user.is_super_admin:
        return query
    university = _scoped_university(admin_user)
    return query.eq("university", university)


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


def _generated_username(supabase: Any, preferred_name: str, application_id: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_]", "", preferred_name.replace(" ", "_"))
    base = (base or "member")[:22]
    candidate = f"{base}_{application_id.replace('-', '')[:6]}"
    return _ensure_username_available(supabase, candidate)


def _invite_application_account(
    supabase: Any,
    application: dict[str, Any],
    admin_user: AuthUser,
    reviewed_at: str,
) -> tuple[str, str, str]:
    if application.get("user_id"):
        profile = get_profile(supabase, application["user_id"])
        return application["user_id"], (profile or {}).get("username") or "member", (
            (profile or {}).get("onboarding_status") or "profile_pending"
        )

    role = "mentor" if application["application_type"] == "volunteer" else "mentee"
    onboarding_status = "training" if role == "mentor" else "profile_pending"
    university = application.get("university") or UNIVERSITY_NOT_SELECTED
    username = _generated_username(
        supabase,
        application.get("preferred_name") or application.get("full_legal_name") or "member",
        application["id"],
    )
    metadata = {
        "role": role,
        "username": username,
        "full_name": application.get("preferred_name") or application.get("full_legal_name"),
        "preferred_name": application.get("preferred_name"),
        "legal_name": application.get("full_legal_name"),
        "phone_number": application.get("phone_number"),
        "university": university,
        "program_application_id": application["id"],
    }

    try:
        invited = supabase.auth.admin.invite_user_by_email(
            application["email"],
            {"data": metadata},
        )
        invited_user = getattr(invited, "user", None)
        user_id = str(getattr(invited_user, "id", ""))
        if not user_id:
            raise RuntimeError("Supabase did not return the invited user.")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The application was not approved because the account invitation failed: {exc}",
        ) from exc

    profile_payload = {
        "id": user_id,
        "role": role,
        "username": username,
        "full_name": application.get("preferred_name") or application.get("full_legal_name"),
        "preferred_name": application.get("preferred_name"),
        "legal_name": application.get("full_legal_name"),
        "phone_number": application.get("phone_number"),
        "university": university,
        "approval_status": "pending" if role == "mentor" else "approved",
        "is_visible": False,
        "same_university_only": True,
        "is_super_admin": False,
        "program_application_id": application["id"],
        "account_status": "invited",
        "onboarding_status": onboarding_status,
        "assigned_coordinator": admin_user.id,
        "stage_started_at": reviewed_at,
    }
    supabase.table("profiles").upsert(profile_payload).execute()
    if role == "mentor":
        supabase.table("mentor_profiles").upsert(
            {"id": user_id, "skills": None, "availability": None}
        ).execute()
    else:
        supabase.table("mentee_profiles").upsert(
            {
                "id": user_id,
                "goals": application.get("support_requested"),
                "interests": [],
            }
        ).execute()
    return user_id, username, onboarding_status


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


@router.get("/program-applications")
def get_program_applications(
    review_state: Literal["pending", "reviewed", "all"] = "pending",
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    query = supabase.table("program_applications").select("*")
    if review_state == "pending":
        query = query.in_("status", ["pending", "reviewing"])
    elif review_state == "reviewed":
        query = query.in_("status", ["approved", "rejected", "withdrawn"])

    result = (
        _scope_program_application_query(query, admin_user)
        .order("created_at", desc=review_state != "pending")
        .execute()
    )
    return {"applications": result.data or []}


@router.post("/program-applications/{application_id}/{action}")
def review_program_application(
    application_id: str,
    action: Literal["approve", "reject"],
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    query = (
        supabase.table("program_applications")
        .select("*")
        .eq("id", application_id)
    )
    result = (
        _scope_program_application_query(query, admin_user)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found.",
        )

    application = result.data[0]
    next_status = "approved" if action == "approve" else "rejected"
    reviewed_at = datetime.now(timezone.utc).isoformat()
    user_id = None
    username = None
    onboarding_status = "rejected"
    if action == "approve":
        user_id, username, onboarding_status = _invite_application_account(
            supabase,
            application,
            admin_user,
            reviewed_at,
        )
    update_result = (
        supabase.table("program_applications")
        .update(
            {
                "status": next_status,
                "reviewed_by": admin_user.id,
                "reviewed_at": reviewed_at,
                "user_id": user_id,
                "invite_sent_at": reviewed_at if action == "approve" else None,
                "onboarding_status": onboarding_status,
            }
        )
        .eq("id", application_id)
        .execute()
    )
    return {
        "message": (
            "Application accepted and a secure account invitation was emailed."
            if action == "approve"
            else "Application denied."
        ),
        "application": (update_result.data or [result.data[0]])[0],
        "username": username,
    }


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
    if not admin_user.is_super_admin:
        query = query.eq("university", _scoped_university(admin_user))
    result = query.order("created_at", desc=True).execute()
    users = result.data or []
    application_ids = [user.get("program_application_id") for user in users if user.get("program_application_id")]
    app_result = (
        supabase.table("program_applications").select("*").in_("id", application_ids).execute()
        if application_ids
        else None
    )
    applications = {row["id"]: row for row in ((app_result.data if app_result else None) or [])}
    matches_result = supabase.table("matches").select("id,mentor_id,mentee_id,status").execute()
    all_matches = matches_result.data or []
    enriched = []
    for user in users:
        user_matches = [
            match for match in all_matches
            if user.get("id") in {match.get("mentor_id"), match.get("mentee_id")}
        ]
        enriched.append(
            {
                **user,
                "email": get_auth_email(supabase, user["id"]),
                "application": applications.get(user.get("program_application_id")),
                "active_match_count": sum(match.get("status") == "active" for match in user_matches),
                "matches": user_matches,
            }
        )
    return {"users": enriched}


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
    for key in (
        "full_name",
        "legal_name",
        "preferred_name",
        "phone_number",
        "bio",
        "approval_status",
        "account_status",
        "onboarding_status",
        "assigned_coordinator",
    ):
        if key in values:
            updates[key] = values[key]
    if payload.username is not None:
        updates["username"] = _ensure_username_available(supabase, payload.username, user_id)
    if payload.university is not None:
        if target_role == "mentee" and payload.university == UNIVERSITY_NOT_SELECTED:
            if not admin_user.is_super_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the super-admin can manage unaffiliated caregivers.",
                )
            updates["university"] = UNIVERSITY_NOT_SELECTED
        else:
            updates["university"] = _scoped_university(admin_user, payload.university)
    elif not admin_user.is_super_admin:
        updates["university"] = _scoped_university(admin_user)
    if payload.role is not None:
        updates["role"] = target_role

    if "onboarding_status" in values and values["onboarding_status"] != existing.get("onboarding_status"):
        updates["stage_started_at"] = datetime.now(timezone.utc).isoformat()
    if values.get("onboarding_status") == "ready":
        updates["account_status"] = "active"
        updates["approval_status"] = "approved"

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


@router.post("/users/{user_id}/lifecycle")
def update_account_lifecycle(
    user_id: str,
    payload: AccountLifecycleUpdate,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    profile = _get_managed_profile(supabase, user_id, admin_user)
    if profile.get("is_super_admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The super-admin account cannot be suspended or deleted.",
        )
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "reactivate":
        updates = {
            "account_status": "active",
            "suspended_at": None,
            "stage_started_at": now,
        }
    else:
        updates = {
            "account_status": "deleted" if payload.action == "delete" else "suspended",
            "suspended_at": now,
            "is_visible": False,
            "stage_started_at": now,
        }
        supabase.table("matches").update(
            {
                "status": "closed",
                "closed_at": now,
                "closed_reason": f"Account {payload.action}d by an administrator",
            }
        ).eq("mentor_id", user_id).in_("status", ["requested", "active"]).execute()
        supabase.table("matches").update(
            {
                "status": "closed",
                "closed_at": now,
                "closed_reason": f"Account {payload.action}d by an administrator",
            }
        ).eq("mentee_id", user_id).in_("status", ["requested", "active"]).execute()
    supabase.table("profiles").update(updates).eq("id", user_id).execute()
    return {
        "message": f"Account {payload.action}d.",
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
            "account_status": "suspended",
            "suspended_at": datetime.now(timezone.utc).isoformat(),
            "is_visible": False,
        }
    ).eq("id", mentor_id).execute()
    supabase.table("matches").update(
        {
            "status": "closed",
            "closed_at": datetime.now(timezone.utc).isoformat(),
            "closed_reason": "Volunteer access removed by an administrator",
        }
    ).eq(
        "mentor_id", mentor_id
    ).in_("status", ["requested", "active"]).execute()
    return {"message": f"Removed mentor access for {mentor_id}."}


@router.get("/dashboard")
def get_dashboard(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    profile_result = _scope_profile_query(
        supabase.table("profiles").select(
            "id,role,full_name,preferred_name,approval_status,university,is_visible,"
            "account_status,onboarding_status,stage_started_at,created_at"
        ),
        admin_user,
    ).execute()
    profiles = profile_result.data or []
    visible_ids = {profile["id"] for profile in profiles}

    matches_result = supabase.table("matches").select(
        "id,mentor_id,mentee_id,status,requested_at,created_at"
    ).execute()
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

    pending_applications_query = (
        supabase.table("program_applications")
        .select("id,application_type,preferred_name,university,status,created_at")
        .in_("status", ["pending", "reviewing"])
    )
    pending_applications = (
        _scope_program_application_query(pending_applications_query, admin_user)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    active_match_volunteer_ids = {
        match.get("mentor_id") for match in scoped_matches if match.get("status") == "active"
    }
    unmatched_volunteers = [
        {
            "id": profile["id"],
            "preferred_name": profile.get("preferred_name") or profile.get("full_name"),
            "university": profile.get("university"),
            "stage_started_at": profile.get("stage_started_at") or profile.get("created_at"),
        }
        for profile in profiles
        if profile.get("role") == "mentor"
        and profile.get("approval_status") == "approved"
        and profile.get("account_status", "active") == "active"
        and profile.get("onboarding_status", "ready") == "ready"
        and profile.get("is_visible")
        and profile.get("id") not in active_match_volunteer_ids
    ]
    profile_lookup = {profile["id"]: profile for profile in profiles}
    awaiting_decisions = [
        {
            **match,
            "volunteer": profile_lookup.get(match.get("mentor_id")),
            "caregiver": profile_lookup.get(match.get("mentee_id")),
        }
        for match in scoped_matches
        if match.get("status") == "requested"
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
        "new_applications": pending_applications,
        "unmatched_volunteers": unmatched_volunteers,
        "awaiting_volunteer_decisions": awaiting_decisions,
    }


@router.get("/matches")
def get_admin_matches(
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    result = (
        supabase.table("matches")
        .select(
            "id,mentor_id,mentee_id,status,care_type,requested_at,activated_at,"
            "closed_at,closed_reason,created_at"
        )
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

    hours_result = supabase.table("volunteer_hours").select(
        "id,match_id,hours,meeting_date,next_meeting,topics_discussed,anything_to_flag"
    ).execute()
    hours_by_match: dict[Any, list[dict[str, Any]]] = {}
    for entry in hours_result.data or []:
        hours_by_match.setdefault(entry.get("match_id"), []).append(entry)

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
                "meeting_logs": hours_by_match.get(match.get("id"), []),
                "total_meetings": len(hours_by_match.get(match.get("id"), [])),
                "total_hours": sum(
                    float(entry.get("hours") or 0)
                    for entry in hours_by_match.get(match.get("id"), [])
                ),
            }
        )
    return {"matches": enriched, "status_counts": status_counts}


@router.patch("/matches/{match_id}")
def update_admin_match_status(
    match_id: int,
    payload: MatchStatusUpdate,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status")
        .eq("id", match_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")
    match = result.data[0]
    participants = get_profiles_by_ids(
        supabase,
        [match.get("mentor_id"), match.get("mentee_id")],
        "id,university",
    )
    if not admin_user.is_super_admin and any(
        participants.get(participant_id, {}).get("university") != admin_user.university
        for participant_id in (match.get("mentor_id"), match.get("mentee_id"))
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")

    now = datetime.now(timezone.utc).isoformat()
    updates: dict[str, Any] = {"status": payload.status}
    if payload.status == "requested":
        updates.update({"requested_at": now, "activated_at": None, "closed_at": None, "closed_reason": None})
    elif payload.status == "active":
        updates.update({"activated_at": now, "closed_at": None, "closed_reason": None})
    else:
        updates.update({"closed_at": now, "closed_reason": payload.closed_reason or "Closed by an administrator"})
    updated = supabase.table("matches").update(updates).eq("id", match_id).execute()
    return {"message": "Match status updated.", "match": (updated.data or [match])[0]}


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
