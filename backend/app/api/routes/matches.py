from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from postgrest.exceptions import APIError

from app.core.auth import AuthUser, require_admin_role, require_auth
from app.core.config import settings
from app.core.email import send_email
from app.core.profiles import get_auth_email, get_profile, get_profiles_by_ids
from app.core.supabase import get_supabase_client
from app.core.universities import UNIVERSITY_NOT_SELECTED
from app.schemas.matches import MatchMessageCreate, MatchRequestPayload, MentorDecisionPayload

router = APIRouter(prefix="/matches", tags=["matches"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_active_account(profile: dict[str, Any], expected_role: str) -> None:
    if (
        profile.get("role") != expected_role
        or profile.get("approval_status") != "approved"
        or profile.get("account_status", "active") != "active"
        or profile.get("onboarding_status", "ready") != "ready"
    ):
        label = "caregivers" if expected_role == "mentee" else "peer support volunteers"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only active, approved {label} can use this feature.",
        )


def _queue_emails(
    background_tasks: BackgroundTasks,
    recipients: list[str | None],
    subject: str,
    html: str,
    reply_to: str | None = None,
) -> None:
    for recipient in dict.fromkeys(email for email in recipients if email):
        background_tasks.add_task(
            send_email,
            recipient,
            subject,
            html,
            reply_to=reply_to,
        )


@router.get("/mentors/available")
def get_available_mentors(
    include_other_universities: bool = False,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, Any]:
    supabase = get_supabase_client()

    requester = get_profile(supabase, current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    is_approved_mentee = (
        requester["role"] == "mentee"
        and requester["approval_status"] == "approved"
        and requester.get("account_status", "active") == "active"
        and requester.get("onboarding_status", "ready") == "ready"
    )
    is_approved_admin = requester["role"] == "admin" and requester["approval_status"] == "approved"
    if not (is_approved_mentee or is_approved_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved caregivers or admins can browse volunteers.",
        )

    mentors_query = (
        supabase.table("profiles")
        .select(
            "id,full_name,preferred_name,bio,profile_picture_url,university,is_visible,"
            "same_university_only,approval_status,mentor_profiles(availability)"
        )
        .eq("role", "mentor")
        .eq("approval_status", "approved")
        .eq("is_visible", True)
    )

    requester_university = requester.get("university")
    is_unaffiliated = (
        not requester_university or requester_university == UNIVERSITY_NOT_SELECTED
    )

    is_super_admin = is_approved_admin and bool(requester.get("is_super_admin"))
    should_filter_by_university = (
        (is_approved_admin and not is_super_admin)
        or (is_approved_mentee and not include_other_universities and not is_unaffiliated)
    )
    if should_filter_by_university:
        mentors_query = mentors_query.eq("university", requester_university)

    mentors_result = mentors_query.order("created_at", desc=False).execute()
    mentors = mentors_result.data or []
    if is_approved_mentee and include_other_universities:
        mentors = [
            mentor
            for mentor in mentors
            if not mentor.get("same_university_only")
            or mentor.get("university") == requester_university
        ]
    elif is_approved_mentee and is_unaffiliated:
        mentors = [mentor for mentor in mentors if not mentor.get("same_university_only")]
    return {
        "mentors": mentors,
        "university": requester_university,
        "includes_other_universities": is_super_admin or (
            is_approved_mentee and include_other_universities
        ),
    }


@router.get("/mentor-requests")
def get_mentor_requests(current_user: AuthUser = Depends(require_auth)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()

    requester = get_profile(supabase, current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    _ensure_active_account(requester, "mentor")

    matches_result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status,care_type,requested_at,activated_at,closed_at,created_at")
        .eq("mentor_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    matches = matches_result.data or []

    mentee_profiles = get_profiles_by_ids(
        supabase,
        (match.get("mentee_id") for match in matches),
        "id,full_name,preferred_name,bio,profile_picture_url,university,approval_status,"
        "phone_number,program_application_id",
    )

    application_ids = [
        profile.get("program_application_id")
        for profile in mentee_profiles.values()
        if profile.get("program_application_id")
    ]
    application_result = (
        supabase.table("program_applications")
        .select(
            "id,preferred_name,caregiving_situation,support_requested,"
            "communication_preference"
        )
        .in_("id", application_ids)
        .execute()
        if application_ids
        else None
    )
    applications = {
        row["id"]: row for row in ((application_result.data if application_result else None) or [])
    }

    enriched = []
    for match in matches:
        enriched.append(
            {
                **match,
                "caregiver_profile": mentee_profiles.get(match["mentee_id"]),
                "caregiver_application": applications.get(
                    (mentee_profiles.get(match["mentee_id"]) or {}).get("program_application_id")
                ),
                "mentee_email": (
                    get_auth_email(supabase, match["mentee_id"])
                    if match.get("status") == "active"
                    else None
                ),
            }
        )

    return {"requests": enriched}


@router.get("/my-requests")
def get_my_requests(current_user: AuthUser = Depends(require_auth)) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()

    requester = get_profile(supabase, current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    _ensure_active_account(requester, "mentee")

    matches_result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status,care_type,requested_at,activated_at,closed_at,created_at")
        .eq("mentee_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    requests = matches_result.data or []

    mentor_profiles = get_profiles_by_ids(
        supabase,
        (request.get("mentor_id") for request in requests),
        "id,full_name,preferred_name,bio,profile_picture_url,university,approval_status",
    )

    enriched = []
    for request in requests:
        enriched.append(
            {
                **request,
                "mentor_profile": mentor_profiles.get(request["mentor_id"]),
                "mentor_email": (
                    get_auth_email(supabase, request["mentor_id"])
                    if request.get("status") == "active"
                    else None
                ),
            }
        )

    return {"requests": enriched}


@router.get("/mentor-requests/{mentor_id}")
def get_mentor_requests_for_admin(
    mentor_id: str, admin_user: AuthUser = Depends(require_admin_role)
) -> dict[str, Any]:
    supabase = get_supabase_client()

    mentor_result = (
        supabase.table("profiles")
        .select(
            "id,full_name,bio,profile_picture_url,university,is_visible,"
            "same_university_only,approval_status,mentor_profiles(availability,total_hours)"
        )
        .eq("id", mentor_id)
        .eq("role", "mentor")
        .limit(1)
        .execute()
    )
    if not mentor_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found.")
    mentor = mentor_result.data[0]
    if not admin_user.is_super_admin and mentor.get("university") != admin_user.university:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found.")

    matches_result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status,care_type,created_at")
        .eq("mentor_id", mentor_id)
        .order("created_at", desc=True)
        .execute()
    )
    matches = matches_result.data or []

    mentee_profiles = get_profiles_by_ids(
        supabase,
        (match.get("mentee_id") for match in matches),
        "id,full_name,bio,profile_picture_url,university,approval_status",
    )

    enriched_requests = [
        {
            **match,
            "mentee_profile": mentee_profiles.get(match["mentee_id"]),
        }
        for match in matches
        if admin_user.is_super_admin
        or (
            mentee_profiles.get(match["mentee_id"])
            and mentee_profiles[match["mentee_id"]].get("university")
            == admin_user.university
        )
    ]
    return {"mentor": mentor, "requests": enriched_requests}


@router.post("/requests")
def create_match_request(
    payload: MatchRequestPayload,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, Any]:
    supabase = get_supabase_client()

    mentee = get_profile(supabase, current_user.id)
    mentor = get_profile(supabase, payload.mentor_id)

    if not mentee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentee profile not found.")
    _ensure_active_account(mentee, "mentee")

    if not mentor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor profile not found.")
    if (
        mentor["role"] != "mentor"
        or mentor["approval_status"] != "approved"
        or mentor.get("account_status", "active") != "active"
        or mentor.get("onboarding_status", "ready") != "ready"
        or not mentor["is_visible"]
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mentor is not currently available.")
    if (
        mentor.get("same_university_only")
        and mentor.get("university") != mentee.get("university")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This volunteer only accepts requests from caregivers at their university.",
        )

    active_result = (
        supabase.table("matches")
        .select("id,mentor_id,status")
        .eq("mentee_id", current_user.id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if active_result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an active volunteer match.",
        )

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
    if existing and existing.get("status") in {"requested", "active"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an open request with this mentor.",
        )

    if existing and existing.get("status") == "closed":
        is_resubmission = True
        try:
            reopen_result = (
                supabase.table("matches")
                .update(
                    {
                        "status": "requested",
                        "care_type": payload.care_type,
                        "requested_at": _now(),
                        "activated_at": None,
                        "closed_at": None,
                        "closed_reason": None,
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
            if "care_type" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database schema mismatch: add the 'care_type' column to the matches table.",
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
                        "status": "requested",
                        "care_type": payload.care_type,
                        "requested_at": _now(),
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
            if "care_type" in message:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database schema mismatch: add the 'care_type' column to the matches table.",
                ) from exc
            raise

        if not insert_result.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create match.")
        match = insert_result.data[0]

    match_id = match["id"]
    if match.get("status") != "requested":
        # Defensive normalization in case a DB default/trigger overrides status.
        normalized_result = (
            supabase.table("matches")
            .update({"status": "requested", "requested_at": _now()})
            .eq("id", match_id)
            .execute()
        )
        if normalized_result.data:
            match = normalized_result.data[0]

    mentor_email = get_auth_email(supabase, payload.mentor_id)
    mentee_email = current_user.email or get_auth_email(supabase, current_user.id)

    subject = f"New volunteer match request (#{match_id})"
    html = (
        f"<p>A new caregiver request is pending volunteer review.</p>"
        f"<p><strong>Match ID:</strong> {match_id}</p>"
        f"<p><strong>Volunteer:</strong> {mentor.get('full_name', 'Volunteer')}</p>"
        f"<p><strong>Caregiver:</strong> {mentee.get('full_name', 'Caregiver')}</p>"
        f"<p><strong>Care type:</strong> {payload.care_type}</p>"
    )

    _queue_emails(
        background_tasks,
        [settings.admin_email, mentor_email, mentee_email],
        subject,
        html,
    )

    return {
        "message": (
            "Previous request reopened and sent for volunteer review."
            if is_resubmission
            else "Match request submitted and pending volunteer approval."
        ),
        "match": match,
        "care_type": payload.care_type,
        "is_resubmission": is_resubmission,
    }


@router.post("/{match_id}/accept")
def accept_match_request(
    match_id: int,
    admin_user: AuthUser = Depends(require_admin_role),
) -> dict[str, str]:
    supabase = get_supabase_client()
    existing = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status")
        .eq("id", match_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")
    match = existing.data[0]
    if not admin_user.is_super_admin:
        participants = get_profiles_by_ids(
            supabase,
            [match.get("mentor_id"), match.get("mentee_id")],
            "id,university",
        )
        if any(
            participants.get(participant_id, {}).get("university")
            != admin_user.university
            for participant_id in (match.get("mentor_id"), match.get("mentee_id"))
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found.",
            )
    if match.get("status") != "requested":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be activated.",
        )

    supabase.table("matches").update(
        {"status": "active", "activated_at": _now()}
    ).eq("id", match_id).execute()
    return {"message": f"Match {match_id} marked active."}


@router.post("/{match_id}/mentor-decision")
def mentor_decision(
    match_id: int,
    payload: MentorDecisionPayload,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, Any]:
    supabase = get_supabase_client()

    requester = get_profile(supabase, current_user.id)
    if not requester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    _ensure_active_account(requester, "mentor")

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
    if match["status"] != "requested":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be accepted or declined.",
        )

    if payload.decision == "accept":
        other_active = (
            supabase.table("matches")
            .select("id,mentor_id,status")
            .eq("mentee_id", match["mentee_id"])
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if any(row.get("id") != match_id for row in (other_active.data or [])):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This caregiver already has an active volunteer match.",
            )

    next_status = "active" if payload.decision == "accept" else "closed"
    status_updates = {
        "status": next_status,
        "activated_at": _now() if next_status == "active" else None,
        "closed_at": _now() if next_status == "closed" else None,
        "closed_reason": "Declined by peer support volunteer" if next_status == "closed" else None,
    }
    updated_result = (
        supabase.table("matches")
        .update(status_updates)
        .eq("id", match_id)
        .execute()
    )

    mentee_profile = get_profile(supabase, match["mentee_id"]) or {}
    mentor_profile = requester
    mentee_email = get_auth_email(supabase, match["mentee_id"])

    decision_text = "accepted" if payload.decision == "accept" else "rejected"
    mentor_name = mentor_profile.get("full_name") or "Your volunteer"
    subject = f"{mentor_name} {decision_text} your request (#{match_id})"
    html = (
        f"<p>Your request has been <strong>{decision_text}</strong>.</p>"
        f"<p><strong>Volunteer:</strong> {mentor_profile.get('full_name', 'Volunteer')}</p>"
        f"<p><strong>Volunteer contact:</strong> {current_user.email or 'Not available'}</p>"
        f"<p><strong>Caregiver:</strong> {mentee_profile.get('full_name', 'Caregiver')}</p>"
    )

    _queue_emails(
        background_tasks,
        [settings.admin_email, mentee_email, current_user.email],
        subject,
        html,
        reply_to=current_user.email,
    )

    return {
        "message": f"Request {decision_text}.",
        "request": (updated_result.data or [match])[0],
    }


def _get_message_match(supabase: Any, match_id: int, current_user: AuthUser) -> dict[str, Any]:
    result = (
        supabase.table("matches")
        .select("id,mentor_id,mentee_id,status")
        .eq("id", match_id)
        .limit(1)
        .execute()
    )
    match = result.data[0] if result.data else None
    if not match or current_user.id not in {match.get("mentor_id"), match.get("mentee_id")}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found.")
    if match.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Messaging is available only after a match is active.",
        )
    return match


@router.get("/{match_id}/messages")
def get_match_messages(
    match_id: int,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, list[dict[str, Any]]]:
    supabase = get_supabase_client()
    _get_message_match(supabase, match_id, current_user)
    result = (
        supabase.table("match_messages")
        .select("id,match_id,sender_id,body,created_at")
        .eq("match_id", match_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"messages": result.data or []}


@router.post("/{match_id}/messages", status_code=status.HTTP_201_CREATED)
def create_match_message(
    match_id: int,
    payload: MatchMessageCreate,
    current_user: AuthUser = Depends(require_auth),
) -> dict[str, Any]:
    supabase = get_supabase_client()
    _get_message_match(supabase, match_id, current_user)
    result = (
        supabase.table("match_messages")
        .insert(
            {
                "match_id": match_id,
                "sender_id": current_user.id,
                "body": payload.body.strip(),
            }
        )
        .execute()
    )
    return {"message": (result.data or [None])[0]}
