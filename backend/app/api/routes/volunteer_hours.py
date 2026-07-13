from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, require_auth
from app.core.profiles import get_profiles_by_ids
from app.core.supabase import get_supabase_client
from app.schemas.volunteer_hours import VolunteerHoursPayload

router = APIRouter(prefix="/volunteer-hours", tags=["volunteer-hours"])


@router.post("")
def log_hours(payload: VolunteerHoursPayload, current_user: AuthUser = Depends(require_auth)) -> dict[str, Any]:
    supabase = get_supabase_client()

    profile_result = supabase.table("profiles").select("role,approval_status").eq("id", current_user.id).limit(1).execute()
    profile = profile_result.data[0] if profile_result.data else None
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    if profile["role"] != "mentor" or profile["approval_status"] != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only approved mentors can log volunteer hours.")

    match_result = supabase.table("matches").select("id,mentor_id,mentee_id,status").eq("id", payload.match_id).limit(1).execute()
    match = match_result.data[0] if match_result.data else None
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")
    if match["mentor_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only log hours for your own matches.")
    if match["status"] != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hours can only be logged for active matches.")

    insert_result = (
        supabase.table("volunteer_hours")
        .insert(
            {
                "match_id": payload.match_id,
                "mentor_id": current_user.id,
                "mentee_id": match["mentee_id"],
                "meeting_date": payload.meeting_date,
                "hours": payload.hours,
                "next_meeting": payload.next_meeting,
                "topics_discussed": payload.topics_discussed,
                "anything_to_flag": payload.anything_to_flag,
            }
        )
        .execute()
    )

    if not insert_result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to log volunteer hours.")

    update_hours = (
        supabase.table("volunteer_hours")
        .select("hours")
        .eq("mentor_id", current_user.id)
        .execute()
    )
    total_hours = sum(float(row.get("hours") or 0) for row in (update_hours.data or []))
    supabase.table("mentor_profiles").update({"total_hours": total_hours}).eq("id", current_user.id).execute()

    return {"message": "Volunteer hours logged.", "entry": insert_result.data[0], "total_hours": total_hours}


@router.get("")
def list_hours(current_user: AuthUser = Depends(require_auth)) -> dict[str, Any]:
    supabase = get_supabase_client()

    profile_result = supabase.table("profiles").select("role").eq("id", current_user.id).limit(1).execute()
    profile = profile_result.data[0] if profile_result.data else None
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    query = supabase.table("volunteer_hours").select("*").order("meeting_date", desc=True)
    if profile["role"] == "admin":
        result = query.execute()
    elif profile["role"] == "mentor":
        result = query.eq("mentor_id", current_user.id).execute()
    else:
        result = query.eq("mentee_id", current_user.id).execute()

    entries = result.data or []
    participant_ids = sorted(
        {
            row["mentor_id"]
            for row in entries
            if row.get("mentor_id")
        }
        | {
            row["mentee_id"]
            for row in entries
            if row.get("mentee_id")
        }
    )
    participant_profiles = get_profiles_by_ids(
        supabase,
        participant_ids,
        "id,full_name",
    )

    enriched_entries = [
        {
            **row,
            "mentor_profile": participant_profiles.get(row.get("mentor_id")),
            "mentee_profile": participant_profiles.get(row.get("mentee_id")),
        }
        for row in entries
    ]
    total_hours = sum(float(row.get("hours") or 0) for row in entries)
    return {"entries": enriched_entries, "total_hours": total_hours}
