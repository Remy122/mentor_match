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
            "message": "Need support for appointments.",
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["match"]["status"] == "pending"
    assert payload["is_resubmission"] is False
    assert payload["match"]["request_message"] == "Need support for appointments."

    duplicate_response = client.post(
        "/api/matches/requests",
        json={
            "mentor_id": "mentor-1",
            "care_type": "Hospital / appointment navigation",
            "message": "Trying duplicate request.",
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
            "message": "Reapplying after decline.",
        },
    )
    assert resubmit_response.status_code == 200
    resubmit_payload = resubmit_response.json()
    assert resubmit_payload["is_resubmission"] is True
    reopened = fake_supabase.tables["matches"][0]
    assert reopened["status"] == "pending"
    assert reopened["care_type"] == "Mental health and emotional support"
    assert reopened["request_message"] == "Reapplying after decline."
    assert len(sent_emails) >= 3


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
            "approval_status": "approved",
            "is_visible": True,
        },
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Mentee One",
            "approval_status": "approved",
            "is_visible": False,
        },
        {
            "id": "admin-1",
            "role": "admin",
            "full_name": "Admin One",
            "approval_status": "approved",
            "is_visible": False,
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
    assert requests_payload["request_message"] == "Initial mentee note."

    decision_response = client.post(
        "/api/matches/55/mentor-decision",
        json={"decision": "accept", "message": "Happy to connect. Reply here."},
    )
    assert decision_response.status_code == 200
    assert fake_supabase.tables["matches"][0]["status"] == "active"
    assert len(sent_emails) == 3  # admin + mentee + mentor copy
    assert all(item[2] == "mentor@example.com" for item in sent_emails)

    log_response = client.post(
        "/api/volunteer-hours",
        json={
            "match_id": 55,
            "meeting_date": "2026-05-05",
            "hours": 1.5,
            "next_meeting": "2026-05-12T18:00",
            "topics_discussed": "Burnout planning and support check-ins.",
        },
    )
    assert log_response.status_code == 200
    assert float(log_response.json()["total_hours"]) == 1.5

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

