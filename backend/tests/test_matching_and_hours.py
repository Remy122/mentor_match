from __future__ import annotations

from app.api.routes import admin as admin_routes
from app.api.routes import auth as auth_routes
from app.api.routes import matches as match_routes
from app.api.routes import volunteer_hours as hours_routes
from app.core.auth import AuthUser, require_admin_role, require_auth
from app.main import app


def _wire_supabase(monkeypatch, fake_supabase):
    monkeypatch.setattr(auth_routes, "get_supabase_client", lambda: fake_supabase)
    monkeypatch.setattr(admin_routes, "get_supabase_client", lambda: fake_supabase)
    monkeypatch.setattr(match_routes, "get_supabase_client", lambda: fake_supabase)
    monkeypatch.setattr(hours_routes, "get_supabase_client", lambda: fake_supabase)


def test_volunteer_directory_defaults_to_same_university(
    client, fake_supabase, monkeypatch
):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Caregiver",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": "mentor-1",
            "role": "mentor",
            "full_name": "Toronto Volunteer",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": True,
            "same_university_only": True,
            "created_at": "2026-01-02T00:00:00Z",
        },
        {
            "id": "mentor-2",
            "role": "mentor",
            "full_name": "Waterloo Volunteer",
            "university": "University of Waterloo",
            "approval_status": "approved",
            "is_visible": True,
            "same_university_only": False,
            "created_at": "2026-01-03T00:00:00Z",
        },
        {
            "id": "mentor-3",
            "role": "mentor",
            "full_name": "Private Waterloo Volunteer",
            "university": "University of Waterloo",
            "approval_status": "approved",
            "is_visible": True,
            "same_university_only": True,
            "created_at": "2026-01-04T00:00:00Z",
        },
    ]
    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="mentee-1", email="mentee@example.com", claims={}
    )

    same_university = client.get("/api/matches/mentors/available")
    assert same_university.status_code == 200
    assert [row["id"] for row in same_university.json()["mentors"]] == [
        "mentor-1"
    ]
    assert same_university.json()["includes_other_universities"] is False

    all_universities = client.get(
        "/api/matches/mentors/available?include_other_universities=true"
    )
    assert all_universities.status_code == 200
    assert [row["id"] for row in all_universities.json()["mentors"]] == [
        "mentor-1",
        "mentor-2",
    ]
    assert all_universities.json()["includes_other_universities"] is True

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="mentor-1", email="mentor@example.com", claims={}
    )
    mentor_browse = client.get("/api/matches/mentors/available")
    assert mentor_browse.status_code == 403


def test_matching_lifecycle_and_resubmission(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)

    sent_emails: list[tuple[str, str]] = []
    monkeypatch.setattr(match_routes, "send_email", lambda to, subject, html, reply_to=None: sent_emails.append((to, subject)))

    fake_supabase.tables["profiles"] = [
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Mentee One",
            "approval_status": "approved",
            "is_visible": False,
        },
        {
            "id": "mentor-1",
            "role": "mentor",
            "full_name": "Mentor One",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": True,
        },
        {
            "id": "mentor-2",
            "role": "mentor",
            "full_name": "Mentor Two",
            "approval_status": "approved",
            "is_visible": True,
        },
    ]
    fake_supabase.users["mentee-1"] = {"email": "mentee@example.com"}
    fake_supabase.users["mentor-1"] = {"email": "mentor@example.com"}

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="mentee-1",
        email="mentee@example.com",
        claims={},
    )

    create_response = client.post(
        "/api/matches/requests",
        json={
            "mentor_id": "mentor-1",
            "care_type": "Hospital / appointment navigation",
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["match"]["status"] == "pending"
    assert payload["is_resubmission"] is False

    duplicate_response = client.post(
        "/api/matches/requests",
        json={
            "mentor_id": "mentor-1",
            "care_type": "Hospital / appointment navigation",
        },
    )
    assert duplicate_response.status_code == 400
    assert "open request" in duplicate_response.json()["detail"]

    fake_supabase.tables["matches"][0]["status"] = "cancelled"
    resubmit_response = client.post(
        "/api/matches/requests",
        json={
            "mentor_id": "mentor-1",
            "care_type": "Mental health and emotional support",
        },
    )
    assert resubmit_response.status_code == 200
    resubmit_payload = resubmit_response.json()
    assert resubmit_payload["is_resubmission"] is True
    reopened = fake_supabase.tables["matches"][0]
    assert reopened["status"] == "pending"
    assert reopened["care_type"] == "Mental health and emotional support"
    assert len(sent_emails) >= 3

    reopened["status"] = "active"
    second_request = client.post(
        "/api/matches/requests",
        json={"mentor_id": "mentor-2", "care_type": "General caregiving guidance"},
    )
    assert second_request.status_code == 400
    assert "active volunteer match" in second_request.json()["detail"]


def test_mentor_decision_and_hours_logging(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)

    sent_emails: list[tuple[str, str, str | None]] = []
    monkeypatch.setattr(
        match_routes,
        "send_email",
        lambda to, subject, html, reply_to=None: sent_emails.append((to, subject, reply_to)),
    )

    fake_supabase.tables["profiles"] = [
        {
            "id": "mentor-1",
            "role": "mentor",
            "full_name": "Mentor One",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": True,
        },
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Mentee One",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": False,
        },
        {
            "id": "admin-1",
            "role": "admin",
            "full_name": "Admin One",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": False,
            "is_super_admin": False,
        },
    ]
    fake_supabase.tables["mentor_profiles"] = [{"id": "mentor-1", "skills": [], "availability": "", "total_hours": 0}]
    fake_supabase.tables["matches"] = [
        {
            "id": 55,
            "mentor_id": "mentor-1",
            "mentee_id": "mentee-1",
            "status": "pending",
            "care_type": "General caregiving guidance",
            "request_message": "Initial mentee note.",
            "created_at": "2026-05-04T12:00:00Z",
        }
    ]
    fake_supabase.users["mentee-1"] = {"email": "mentee@example.com"}

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="mentor-1",
        email="mentor@example.com",
        claims={},
    )

    requests_response = client.get("/api/matches/mentor-requests")
    assert requests_response.status_code == 200
    requests_payload = requests_response.json()["requests"][0]
    assert requests_payload["care_type"] == "General caregiving guidance"
    assert requests_payload["mentee_email"] is None

    decision_response = client.post(
        "/api/matches/55/mentor-decision",
        json={"decision": "accept"},
    )
    assert decision_response.status_code == 200
    assert fake_supabase.tables["matches"][0]["status"] == "active"
    assert len(sent_emails) == 3  # admin + mentee + mentor copy
    assert all(item[2] == "mentor@example.com" for item in sent_emails)

    active_requests_response = client.get("/api/matches/mentor-requests")
    assert active_requests_response.status_code == 200
    assert (
        active_requests_response.json()["requests"][0]["mentee_email"]
        == "mentee@example.com"
    )

    second_decision = client.post(
        "/api/matches/55/mentor-decision",
        json={"decision": "reject"},
    )
    assert second_decision.status_code == 400

    log_response = client.post(
        "/api/volunteer-hours",
        json={
            "match_id": 55,
            "meeting_date": "2026-05-05",
            "hours": 1.5,
            "next_meeting": "2026-05-12T18:00",
            "topics_discussed": "Burnout planning and support check-ins.",
            "anything_to_flag": "Follow up on respite options.",
        },
    )
    assert log_response.status_code == 200
    assert float(log_response.json()["total_hours"]) == 1.5
    assert log_response.json()["entry"]["anything_to_flag"] == "Follow up on respite options."

    invalid_hours_response = client.post(
        "/api/volunteer-hours",
        json={
            "match_id": 55,
            "meeting_date": "2026-05-06",
            "hours": 0,
            "topics_discussed": "Check-in.",
        },
    )
    assert invalid_hours_response.status_code == 422

    excessive_hours_response = client.post(
        "/api/volunteer-hours",
        json={
            "match_id": 55,
            "meeting_date": "2026-05-06",
            "hours": 25,
            "topics_discussed": "Check-in.",
        },
    )
    assert excessive_hours_response.status_code == 422

    empty_topics_response = client.post(
        "/api/volunteer-hours",
        json={
            "match_id": 55,
            "meeting_date": "2026-05-06",
            "hours": 1,
            "topics_discussed": "",
        },
    )
    assert empty_topics_response.status_code == 422

    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
    )
    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
    )

    admin_hours_response = client.get("/api/volunteer-hours")
    assert admin_hours_response.status_code == 200
    admin_hours_payload = admin_hours_response.json()
    assert len(admin_hours_payload["entries"]) == 1
    entry = admin_hours_payload["entries"][0]
    assert entry["mentor_profile"]["full_name"] == "Mentor One"
    assert entry["mentee_profile"]["full_name"] == "Mentee One"


def test_decline_status_and_one_active_match_guard(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)
    monkeypatch.setattr(match_routes, "send_email", lambda *args, **kwargs: None)
    fake_supabase.tables["profiles"] = [
        {"id": "mentor-1", "role": "mentor", "full_name": "One", "approval_status": "approved", "is_visible": True},
        {"id": "mentor-2", "role": "mentor", "full_name": "Two", "approval_status": "approved", "is_visible": True},
        {"id": "mentee-1", "role": "mentee", "full_name": "Caregiver", "approval_status": "approved", "is_visible": False},
    ]
    fake_supabase.tables["matches"] = [
        {"id": 1, "mentor_id": "mentor-1", "mentee_id": "mentee-1", "status": "active", "created_at": "2026-01-01T00:00:00Z"},
        {"id": 2, "mentor_id": "mentor-2", "mentee_id": "mentee-1", "status": "pending", "created_at": "2026-01-02T00:00:00Z"},
    ]
    app.dependency_overrides[require_auth] = lambda: AuthUser(id="mentor-2", email="two@example.com", claims={})

    blocked_accept = client.post("/api/matches/2/mentor-decision", json={"decision": "accept"})
    assert blocked_accept.status_code == 409
    assert fake_supabase.tables["matches"][1]["status"] == "pending"

    declined = client.post("/api/matches/2/mentor-decision", json={"decision": "reject"})
    assert declined.status_code == 200
    assert fake_supabase.tables["matches"][1]["status"] == "declined"


def test_admin_match_action_is_university_scoped_and_hours_require_approval(
    client, fake_supabase, monkeypatch
):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": "admin-1",
            "role": "admin",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_super_admin": False,
        },
        {
            "id": "mentor-1",
            "role": "mentor",
            "university": "University of Toronto",
            "approval_status": "approved",
        },
        {
            "id": "mentee-1",
            "role": "mentee",
            "university": "University of Waterloo",
            "approval_status": "approved",
        },
    ]
    fake_supabase.tables["matches"] = [
        {
            "id": 91,
            "mentor_id": "mentor-1",
            "mentee_id": "mentee-1",
            "status": "pending",
        }
    ]
    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        role="admin",
        university="University of Toronto",
        approval_status="approved",
        is_super_admin=False,
    )

    cross_university_match = client.post("/api/matches/91/accept")
    assert cross_university_match.status_code == 404
    assert fake_supabase.tables["matches"][0]["status"] == "pending"

    fake_supabase.tables["profiles"][2]["university"] = "University of Toronto"
    same_university_match = client.post("/api/matches/91/accept")
    assert same_university_match.status_code == 200
    assert fake_supabase.tables["matches"][0]["status"] == "active"

    fake_supabase.tables["profiles"][0]["approval_status"] = "pending"
    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="admin-1", email="admin@example.com"
    )
    hours_response = client.get("/api/volunteer-hours")
    assert hours_response.status_code == 403
