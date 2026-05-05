from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from postgrest.exceptions import APIError

from app.core.auth import AuthUser, require_admin_role, require_auth
from app.core.config import settings
from app.core.email import send_email
from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/matches", tags=["matches"])


class MatchRequestPayload(BaseModel):
    mentor_id: str
    care_type: str
    message: str


class MentorDecisionPayload(BaseModel):
    decision: Literal["accept", "reject"]
    message: str | None = None


def _get_profile(user_id: str) -> dict[str, Any] | None:
    supabase = get_supabase_client()
    result = supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    return result.data[0] if result.data else None


def _get_auth_email(user_id: str) -> str | None:
    supabase = get_supabase_client()
    try:
        result = supabase.auth.admin.get_user_by_id(user_id)
        user = getattr(result, "user", None)
        return getattr(user, "email", None)
    except Exception:
        return None


@router.get("/mentors/available")
def get_available_mentors(current_user: AuthUser = Depends(require_auth)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()

    requester = _get_profile(current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    is_approved_mentee = requester["role"] == "mentee" and requester["approval_status"] == "approved"
    is_approved_admin = requester["role"] == "admin" and requester["approval_status"] == "approved"
    is_approved_mentor = requester["role"] == "mentor" and requester["approval_status"] == "approved"
    if not (is_approved_mentee or is_approved_admin or is_approved_mentor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved mentees, mentors, or admins can browse mentors.",
        )

    mentors_result = (
        supabase.table("profiles")
        .select("id,full_name,bio,profile_picture_url,is_visible,approval_status,mentor_profiles(skills,availability)")
        .eq("role", "mentor")
        .eq("approval_status", "approved")
        .eq("is_visible", True)
        .order("created_at", desc=False)
        .execute()
    )
    return {"mentors": mentors_result.data or []}


@router.get("/mentor-requests")
def get_mentor_requests(current_user: AuthUser = Depends(require_auth)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()

    requester = _get_profile(current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    if requester["role"] != "mentor" or requester["approval_status"] != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved mentors can view incoming mentee requests.",
        )

    try:
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,care_type,request_message,created_at")
            .eq("mentor_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        message = str(exc)
        if "matches.care_type" not in message and "matches.request_message" not in message:
            raise
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,created_at")
            .eq("mentor_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )
    matches = matches_result.data or []

    mentee_ids = [match["mentee_id"] for match in matches]
    mentee_profiles: dict[str, Any] = {}
    if mentee_ids:
        profiles_result = (
            supabase.table("profiles")
            .select("id,full_name,bio,profile_picture_url,approval_status")
            .in_("id", mentee_ids)
            .execute()
        )
        mentee_profiles = {profile["id"]: profile for profile in (profiles_result.data or [])}

    enriched = []
    for match in matches:
        enriched.append(
            {
                **match,
                "mentee_profile": mentee_profiles.get(match["mentee_id"]),
                "mentee_email": _get_auth_email(match["mentee_id"]),
            }
        )

    return {"requests": enriched}


@router.get("/my-requests")
def get_my_requests(current_user: AuthUser = Depends(require_auth)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()

    requester = _get_profile(current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    if requester["role"] != "mentee" or requester["approval_status"] != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved mentees can view submitted requests.",
        )

    try:
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,care_type,request_message,created_at")
            .eq("mentee_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        message = str(exc)
        if "matches.care_type" not in message and "matches.request_message" not in message:
            raise
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,created_at")
            .eq("mentee_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )
    requests = matches_result.data or []

    mentor_ids = [request["mentor_id"] for request in requests]
    mentor_profiles: dict[str, Any] = {}
    if mentor_ids:
        mentors_result = (
            supabase.table("profiles")
            .select("id,full_name,bio,profile_picture_url,approval_status")
            .in_("id", mentor_ids)
            .execute()
        )
        mentor_profiles = {mentor["id"]: mentor for mentor in (mentors_result.data or [])}

    enriched = []
    for request in requests:
        enriched.append(
            {
                **request,
                "mentor_profile": mentor_profiles.get(request["mentor_id"]),
                "mentor_email": _get_auth_email(request["mentor_id"]),
            }
        )

    return {"requests": enriched}


@router.get("/mentor-requests/{mentor_id}")
def get_mentor_requests_for_admin(
    mentor_id: str, _: AuthUser = Depends(require_admin_role)
) -> dict[str, Any]:
    supabase = get_supabase_client()

    mentor_result = (
        supabase.table("profiles")
        .select("id,full_name,bio,profile_picture_url,is_visible,approval_status,mentor_profiles(skills,availability,total_hours)")
        .eq("id", mentor_id)
        .eq("role", "mentor")
        .limit(1)
        .execute()
    )
    if not mentor_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found.")
    mentor = mentor_result.data[0]

    try:
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,care_type,request_message,created_at")
            .eq("mentor_id", mentor_id)
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        message = str(exc)
        if "matches.care_type" not in message and "matches.request_message" not in message:
            raise
        matches_result = (
            supabase.table("matches")
            .select("id,mentor_id,mentee_id,status,created_at")
            .eq("mentor_id", mentor_id)
            .order("created_at", desc=True)
            .execute()
        )
    matches = matches_result.data or []

    mentee_ids = [match["mentee_id"] for match in matches]
    mentee_profiles: dict[str, Any] = {}
    if mentee_ids:
        profiles_result = (
            supabase.table("profiles")
            .select("id,full_name,bio,profile_picture_url,approval_status")
            .in_("id", mentee_ids)
            .execute()
        )
        mentee_profiles = {profile["id"]: profile for profile in (profiles_result.data or [])}

    enriched_requests = [
        {
            **match,
            "mentee_profile": mentee_profiles.get(match["mentee_id"]),
        }
        for match in matches
    ]
    return {"mentor": mentor, "requests": enriched_requests}


@router.post("/requests")
def create_match_request(payload: MatchRequestPayload, current_user: AuthUser = Depends(require_auth)) -> dict[str, Any]:
    supabase = get_supabase_client()

    mentee = _get_profile(current_user.id)
    mentor = _get_profile(payload.mentor_id)

    if not mentee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentee profile not found.")
    if mentee["role"] != "mentee" or mentee["approval_status"] != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only approved mentees can request matches.")

    if not mentor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor profile not found.")
    if mentor["role"] != "mentor" or mentor["approval_status"] != "approved" or not mentor["is_visible"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mentor is not currently available.")

    existing_result = (
        supabase.table("matches")
        .select("id,status,mentor_id,mentee_id,created_at")
        .eq("mentor_id", payload.mentor_id)
        .eq("mentee_id", current_user.id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    existing = existing_result.data[0] if existing_result.data else None

    is_resubmission = False
    if existing and existing.get("status") in {"pending", "active"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an open request with this mentor.",
        )

    if existing and existing.get("status") in {"cancelled", "declined", "rejected"}:
        is_resubmission = True
        try:
            reopen_result = (
                supabase.table("matches")
                .update(
                    {
                        "status": "pending",
                        "care_type": payload.care_type,
                        "request_message": payload.message,
                    }
                )
                .eq("id", existing["id"])
                .execute()
            )
        except APIError as exc:
            message = str(exc)
            if "matches_status_check" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database constraint mismatch: 'pending' status is not allowed by matches_status_check.",
                ) from exc
            if "request_message" in message or "care_type" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database schema mismatch: add 'care_type' and 'request_message' columns to matches table.",
                ) from exc
            raise
        if not reopen_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reopen your previous request.",
            )
        match = reopen_result.data[0]
    else:
        try:
            insert_result = (
                supabase.table("matches")
                .insert(
                    {
                        "mentor_id": payload.mentor_id,
                        "mentee_id": current_user.id,
                        "status": "pending",
                        "care_type": payload.care_type,
                        "request_message": payload.message,
                    }
                )
                .execute()
            )
        except APIError as exc:
            message = str(exc)
            if "matches_status_check" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database constraint mismatch: 'pending' status is not allowed by matches_status_check.",
                ) from exc
            if "request_message" in message or "care_type" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database schema mismatch: add 'care_type' and 'request_message' columns to matches table.",
                ) from exc
            raise

        if not insert_result.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create match.")
        match = insert_result.data[0]

    match_id = match["id"]
    if match.get("status") != "pending":
        # Defensive normalization in case a DB default/trigger overrides status.
        normalized_result = (
            supabase.table("matches")
            .update({"status": "pending"})
            .eq("id", match_id)
            .execute()
        )
        if normalized_result.data:
            match = normalized_result.data[0]

    mentor_email = _get_auth_email(payload.mentor_id)
    mentee_email = _get_auth_email(current_user.id) or current_user.email

    subject = f"New mentor request created (#{match_id})"
    html = (
        f"<p>A new mentee request is pending mentor approval.</p>"
        f"<p><strong>Match ID:</strong> {match_id}</p>"
        f"<p><strong>Mentor:</strong> {mentor.get('full_name', 'Mentor')}</p>"
        f"<p><strong>Mentee:</strong> {mentee.get('full_name', 'Mentee')}</p>"
        f"<p><strong>Care type:</strong> {payload.care_type}</p>"
        f"<p><strong>Message:</strong> {payload.message}</p>"
    )

    if settings.admin_email:
        send_email(settings.admin_email, subject, html)
    if mentor_email:
        send_email(mentor_email, subject, html)
    if mentee_email:
        send_email(mentee_email, subject, html)

    return {
        "message": (
            "Previous request reopened and sent for mentor review."
            if is_resubmission
            else "Match request submitted and pending mentor approval."
        ),
        "match": match,
        "care_type": payload.care_type,
        "is_resubmission": is_resubmission,
    }


@router.post("/{match_id}/accept")
def accept_match_request(match_id: int, _: AuthUser = Depends(require_admin_role)) -> dict[str, str]:
    supabase = get_supabase_client()
    existing = supabase.table("matches").select("id").eq("id", match_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")

    supabase.table("matches").update({"status": "active"}).eq("id", match_id).execute()
    return {"message": f"Match {match_id} marked active."}


@router.post("/{match_id}/mentor-decision")
def mentor_decision(
    match_id: int,
    payload: MentorDecisionPayload,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, Any]:
    supabase = get_supabase_client()

    requester = _get_profile(current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    if requester["role"] != "mentor" or requester["approval_status"] != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved mentors can manage mentee requests.",
        )

    match_result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status,created_at")
        .eq("id", match_id)
        .limit(1)
        .execute()
    )
    if not match_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    match = match_result.data[0]

    if match["mentor_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage requests assigned to you.",
        )
    if match["status"] == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This request is already cancelled and cannot be updated.",
        )

    next_status = "active" if payload.decision == "accept" else "cancelled"
    updated_result = (
        supabase.table("matches")
        .update({"status": next_status})
        .eq("id", match_id)
        .execute()
    )

    mentee_profile = _get_profile(match["mentee_id"]) or {}
    mentor_profile = _get_profile(current_user.id) or {}
    mentee_email = _get_auth_email(match["mentee_id"])

    message_block = (
        f"<p><strong>Mentor message:</strong> {payload.message}</p>"
        if payload.message and payload.message.strip()
        else "<p><strong>Mentor message:</strong> (none provided)</p>"
    )
    decision_text = "accepted" if payload.decision == "accept" else "rejected"
    mentor_name = mentor_profile.get("full_name") or "Your mentor"
    subject = f"{mentor_name} {decision_text} your request (#{match_id})"
    html = (
        f"<p>Your request has been <strong>{decision_text}</strong>.</p>"
        f"<p><strong>Mentor:</strong> {mentor_profile.get('full_name', 'Mentor')}</p>"
        f"<p><strong>Mentor contact:</strong> {current_user.email or 'Not available'}</p>"
        f"<p><strong>Mentee:</strong> {mentee_profile.get('full_name', 'Mentee')}</p>"
        f"{message_block}"
    )

    if settings.admin_email:
        send_email(settings.admin_email, subject, html, reply_to=current_user.email)
    if mentee_email:
        send_email(mentee_email, subject, html, reply_to=current_user.email)
    if current_user.email:
        send_email(current_user.email, subject, html, reply_to=current_user.email)

    return {
        "message": f"Request {decision_text}.",
        "request": (updated_result.data or [match])[0],
    }
