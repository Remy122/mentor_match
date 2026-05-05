from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, require_admin_role
from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/pending-users")
def get_pending_users(_: AuthUser = Depends(require_admin_role)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select(
            "id,role,full_name,bio,profile_picture_url,approval_status,is_visible,created_at,"
            "mentor_profiles(skills,availability,total_hours),"
            "mentee_profiles(goals,interests)"
        )
        .eq("approval_status", "pending")
        .in_("role", ["mentor", "mentee"])
        .order("created_at", desc=False)
        .execute()
    )
    return {"pending_users": result.data or []}


@router.get("/reviewed-users")
def get_reviewed_users(_: AuthUser = Depends(require_admin_role)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select(
            "id,role,full_name,bio,profile_picture_url,approval_status,is_visible,created_at,"
            "mentor_profiles(skills,availability,total_hours),"
            "mentee_profiles(goals,interests)"
        )
        .in_("approval_status", ["approved", "rejected"])
        .in_("role", ["mentor", "mentee"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"reviewed_users": result.data or []}


@router.post("/users/{user_id}/approve")
def approve_user(user_id: str, _: AuthUser = Depends(require_admin_role)) -> dict[str, str]:
    supabase = get_supabase_client()
    profile_result = supabase.table("profiles").select("id,role").eq("id", user_id).limit(1).execute()
    if not profile_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    role = profile_result.data[0]["role"]
    is_visible = True if role == "mentor" else False

    supabase.table("profiles").update(
        {
            "approval_status": "approved",
            "is_visible": is_visible,
        }
    ).eq("id", user_id).execute()
    return {"message": f"Approved user {user_id}."}


@router.post("/users/{user_id}/reject")
def reject_user(user_id: str, _: AuthUser = Depends(require_admin_role)) -> dict[str, str]:
    supabase = get_supabase_client()
    profile_result = supabase.table("profiles").select("id").eq("id", user_id).limit(1).execute()
    if not profile_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    supabase.table("profiles").update(
        {
            "approval_status": "rejected",
            "is_visible": False,
        }
    ).eq("id", user_id).execute()
    return {"message": f"Rejected user {user_id}."}


@router.post("/mentors/{mentor_id}/remove-access")
def remove_mentor_access(mentor_id: str, _: AuthUser = Depends(require_admin_role)) -> dict[str, str]:
    supabase = get_supabase_client()

    mentor_result = (
        supabase.table("profiles")
        .select("id,role")
        .eq("id", mentor_id)
        .eq("role", "mentor")
        .limit(1)
        .execute()
    )
    if not mentor_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found.")

    # Remove from directory and revoke approved mentor access.
    supabase.table("profiles").update(
        {
            "approval_status": "rejected",
            "is_visible": False,
        }
    ).eq("id", mentor_id).execute()

    # Close any current/pending mentor requests tied to this mentor.
    supabase.table("matches").update({"status": "cancelled"}).eq("mentor_id", mentor_id).in_(
        "status", ["pending", "active"]
    ).execute()

    return {"message": f"Removed mentor access for {mentor_id}."}


@router.get("/dashboard")
def get_dashboard(_: AuthUser = Depends(require_admin_role)) -> dict[str, float]:
    supabase = get_supabase_client()

    mentors = (
        supabase.table("profiles")
        .select("id", count="exact")
        .eq("role", "mentor")
        .eq("approval_status", "approved")
        .execute()
    )
    mentees = (
        supabase.table("profiles")
        .select("id", count="exact")
        .eq("role", "mentee")
        .eq("approval_status", "approved")
        .execute()
    )
    matches = (
        supabase.table("matches")
        .select("id", count="exact")
        .eq("status", "active")
        .execute()
    )
    hours_rows = supabase.table("volunteer_hours").select("hours").execute()
    total_hours = sum(float(row.get("hours") or 0) for row in (hours_rows.data or []))

    return {
        "active_mentors": float(mentors.count or 0),
        "active_mentees": float(mentees.count or 0),
        "current_matches": float(matches.count or 0),
        "volunteer_hours_total": total_hours,
    }


@router.get("/mentors")
def get_admin_mentors(_: AuthUser = Depends(require_admin_role)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select("id,full_name,bio,profile_picture_url,is_visible,approval_status,mentor_profiles(skills,availability,total_hours)")
        .eq("role", "mentor")
        .eq("approval_status", "approved")
        .order("created_at", desc=False)
        .execute()
    )
    return {"mentors": result.data or []}
