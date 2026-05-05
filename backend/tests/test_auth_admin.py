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


def test_auth_sync_profile_and_get_me(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="u1",
        email="mentor@example.com",
        claims={"user_metadata": {"full_name": "Mentor One"}},
    )

    sync_response = client.post(
        "/api/auth/sync-profile",
        json={"role": "mentor", "skills": ["peer support"], "availability": "weekdays"},
    )
    assert sync_response.status_code == 200
    payload = sync_response.json()
    assert payload["profile"]["full_name"] == "Mentor One"
    assert payload["profile"]["approval_status"] == "pending"
    assert payload["mentor_profile"]["skills"] == ["peer support"]

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    me_payload = me_response.json()
    assert me_payload["profile"]["id"] == "u1"
    assert me_payload["profile"]["role"] == "mentor"


def test_auth_update_profile(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": "u2",
            "role": "mentee",
            "full_name": "Old Name",
            "approval_status": "approved",
            "is_visible": False,
        }
    ]
    fake_supabase.tables["mentee_profiles"] = [{"id": "u2", "goals": "old", "interests": ["x"]}]

    app.dependency_overrides[require_auth] = lambda: AuthUser(id="u2", email="mentee@example.com", claims={})

    response = client.patch(
        "/api/auth/me",
        json={
            "full_name": "Updated Name",
            "goals": "better support",
            "interests": ["navigation", "burnout"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["full_name"] == "Updated Name"
    assert payload["mentee_profile"]["goals"] == "better support"
    assert payload["mentee_profile"]["interests"] == ["navigation", "burnout"]


def test_admin_approve_reject_and_remove_access(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)

    fake_supabase.tables["profiles"] = [
        {
            "id": "mentor-1",
            "role": "mentor",
            "full_name": "Mentor One",
            "approval_status": "pending",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Mentee One",
            "approval_status": "pending",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
    ]
    fake_supabase.tables["matches"] = [
        {"id": 11, "mentor_id": "mentor-1", "mentee_id": "mentee-1", "status": "pending"}
    ]

    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
    )

    pending_response = client.get("/api/admin/pending-users")
    assert pending_response.status_code == 200
    assert len(pending_response.json()["pending_users"]) == 2

    approve_response = client.post("/api/admin/users/mentor-1/approve")
    assert approve_response.status_code == 200
    mentor = next(row for row in fake_supabase.tables["profiles"] if row["id"] == "mentor-1")
    assert mentor["approval_status"] == "approved"
    assert mentor["is_visible"] is True

    reject_response = client.post("/api/admin/users/mentee-1/reject")
    assert reject_response.status_code == 200
    mentee = next(row for row in fake_supabase.tables["profiles"] if row["id"] == "mentee-1")
    assert mentee["approval_status"] == "rejected"

    remove_response = client.post("/api/admin/mentors/mentor-1/remove-access")
    assert remove_response.status_code == 200
    assert mentor["approval_status"] == "rejected"
    assert mentor["is_visible"] is False
    match = fake_supabase.tables["matches"][0]
    assert match["status"] == "cancelled"

