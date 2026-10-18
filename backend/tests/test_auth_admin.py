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
        json={
            "role": "mentor",
            "username": "volunteer_one",
            "university": "University of Toronto",
            "skills": ["peer support"],
            "availability": "weekdays",
        },
    )
    assert sync_response.status_code == 200
    payload = sync_response.json()
    assert payload["profile"]["full_name"] == "Mentor One"
    assert payload["profile"]["approval_status"] == "pending"
    assert payload["profile"]["username"] == "volunteer_one"
    assert payload["profile"]["university"] == "University of Toronto"
    assert payload["profile"]["is_visible"] is False
    assert payload["mentor_profile"]["skills"] == ["peer support"]

    role_change_response = client.post(
        "/api/auth/sync-profile",
        json={
            "role": "mentee",
            "username": "volunteer_one",
            "goals": "This must not change the approved account role.",
        },
    )
    assert role_change_response.status_code == 200
    assert role_change_response.json()["profile"]["role"] == "mentor"
    assert role_change_response.json()["mentee_profile"] is None

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
            "university": "McMaster University",
            "profile_picture_url": "",
            "goals": "better support",
            "interests": ["navigation", "burnout"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["full_name"] == "Updated Name"
    assert payload["profile"]["university"] == "McMaster University"
    assert payload["profile"]["profile_picture_url"] is None
    assert payload["mentee_profile"]["goals"] == "better support"
    assert payload["mentee_profile"]["interests"] == ["navigation", "burnout"]

    invalid_university = client.patch(
        "/api/auth/me",
        json={"university": "Somewhere Outside Ontario"},
    )
    assert invalid_university.status_code == 422


def test_admin_cannot_change_own_university(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": "admin-1",
            "role": "admin",
            "username": "admin_one",
            "full_name": "Admin One",
            "university": "University of Toronto",
            "approval_status": "approved",
            "is_visible": False,
            "same_university_only": True,
            "is_super_admin": False,
        }
    ]
    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
    )

    response = client.patch(
        "/api/auth/me",
        json={"university": "University of Waterloo"},
    )

    assert response.status_code == 403
    assert fake_supabase.tables["profiles"][0]["university"] == "University of Toronto"


def test_admin_approve_reject_and_remove_access(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)

    fake_supabase.tables["profiles"] = [
        {
            "id": "mentor-1",
            "role": "mentor",
            "full_name": "Mentor One",
            "university": "University of Toronto",
            "approval_status": "pending",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": "mentee-1",
            "role": "mentee",
            "full_name": "Mentee One",
            "university": "University of Toronto",
            "approval_status": "pending",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
    ]
    fake_supabase.tables["matches"] = [
        {
            "id": 11,
            "mentor_id": "mentor-1",
            "mentee_id": "mentee-1",
                "status": "requested",
            "care_type": "Navigation",
            "created_at": "2026-01-02T00:00:00Z",
        }
    ]

    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
    )

    pending_response = client.get("/api/admin/pending-users")
    assert pending_response.status_code == 200
    assert len(pending_response.json()["pending_users"]) == 2

    matches_response = client.get("/api/admin/matches")
    assert matches_response.status_code == 200
    admin_match = matches_response.json()["matches"][0]
    assert admin_match["volunteer_profile"]["full_name"] == "Mentor One"
    assert admin_match["caregiver_profile"]["full_name"] == "Mentee One"
    assert matches_response.json()["status_counts"] == {"requested": 1}

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
    assert match["status"] == "closed"


def test_large_admin_response_is_compressed(client, fake_supabase, monkeypatch):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": f"pending-{index}",
            "role": "mentor",
            "full_name": f"Pending Volunteer {index}",
            "bio": "Profile details " * 30,
            "approval_status": "pending",
            "is_visible": False,
            "created_at": "2026-01-01T00:00:00Z",
        }
        for index in range(20)
    ]
    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
        role="admin",
        approval_status="approved",
        is_super_admin=True,
    )

    response = client.get(
        "/api/admin/pending-users",
        headers={"Accept-Encoding": "gzip"},
    )

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert len(response.json()["pending_users"]) == 20


def test_admin_university_scope_preapprovals_and_profile_management(
    client, fake_supabase, monkeypatch
):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["profiles"] = [
        {
            "id": "toronto-mentee",
            "role": "mentee",
            "username": "toronto_member",
            "full_name": "Toronto Member",
            "university": "University of Toronto",
            "approval_status": "pending",
            "is_visible": False,
            "same_university_only": True,
            "is_super_admin": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": "waterloo-mentee",
            "role": "mentee",
            "username": "waterloo_member",
            "full_name": "Waterloo Member",
            "university": "University of Waterloo",
            "approval_status": "pending",
            "is_visible": False,
            "same_university_only": True,
            "is_super_admin": False,
            "created_at": "2026-01-02T00:00:00Z",
        },
    ]

    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-toronto",
        email="admin@toronto.example",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
        is_super_admin=False,
    )

    scoped_pending = client.get("/api/admin/pending-users")
    assert scoped_pending.status_code == 200
    assert [row["id"] for row in scoped_pending.json()["pending_users"]] == [
        "toronto-mentee"
    ]

    cross_university_invite = client.post(
        "/api/admin/preapproved-emails",
        json={
            "email": "member@waterloo.example",
            "role": "mentor",
            "university": "University of Waterloo",
        },
    )
    assert cross_university_invite.status_code == 403

    invite = client.post(
        "/api/admin/preapproved-emails",
        json={
            "email": "member@toronto.example",
            "role": "mentor",
            "university": "University of Toronto",
        },
    )
    assert invite.status_code == 200
    assert invite.json()["preapproved_email"]["email"] == "member@toronto.example"

    normal_admin_create_admin = client.post(
        "/api/admin/users",
        json={
            "email": "another-admin@example.com",
            "password": "Temporary123!",
            "role": "admin",
            "username": "another_admin",
            "full_name": "Another Admin",
            "university": "University of Toronto",
        },
    )
    assert normal_admin_create_admin.status_code == 403

    cross_university_edit = client.patch(
        "/api/admin/users/waterloo-mentee",
        json={"full_name": "Blocked Edit"},
    )
    assert cross_university_edit.status_code == 404

    own_university_edit = client.patch(
        "/api/admin/users/toronto-mentee",
        json={"full_name": "Updated Toronto Member"},
    )
    assert own_university_edit.status_code == 200
    assert own_university_edit.json()["profile"]["full_name"] == "Updated Toronto Member"

    fake_supabase.users["toronto-mentee"] = {"email": "member@toronto.example"}
    delete_response = client.post(
        "/api/admin/users/toronto-mentee/lifecycle",
        json={"action": "delete"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "message": "Account permanently deleted.",
        "deleted_user_id": "toronto-mentee",
    }
    assert "toronto-mentee" not in fake_supabase.users
    assert all(
        row["id"] != "toronto-mentee"
        for row in fake_supabase.tables["profiles"]
    )

    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="super-admin",
        email="jayhung005@gmail.com",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
        is_super_admin=True,
    )
    created_admin = client.post(
        "/api/admin/users",
        json={
            "email": "new-admin@example.com",
            "password": "Temporary123!",
            "role": "admin",
            "username": "new_admin",
            "full_name": "New Admin",
            "university": "University of Waterloo",
        },
    )
    assert created_admin.status_code == 200
    assert created_admin.json()["profile"]["role"] == "admin"
    assert created_admin.json()["profile"]["is_super_admin"] is False


def test_application_approval_sends_secure_invitation_and_creates_unified_profile(
    client, fake_supabase, monkeypatch
):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["program_applications"] = [
        {
            "id": "application-1",
            "application_type": "volunteer",
            "full_legal_name": "Taylor Volunteer",
            "preferred_name": "Taylor",
            "email": "taylor@example.com",
            "phone_number": "416-555-0101",
            "university": "University of Toronto",
            "status": "pending",
            "created_at": "2026-01-01T00:00:00Z",
        }
    ]
    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-1",
        email="admin@example.com",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
    )

    response = client.post("/api/admin/program-applications/application-1/approve")

    assert response.status_code == 200
    assert "secure account invitation" in response.json()["message"]
    invited_user_id = response.json()["application"]["user_id"]
    profile = next(row for row in fake_supabase.tables["profiles"] if row["id"] == invited_user_id)
    assert profile["preferred_name"] == "Taylor"
    assert profile["account_status"] == "invited"
    assert profile["onboarding_status"] == "training"
    assert profile["assigned_coordinator"] == "admin-1"
    assert "password" not in fake_supabase.users[invited_user_id]

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        id=invited_user_id,
        email="taylor@example.com",
        claims={},
    )
    completed = client.post("/api/auth/complete-invitation")
    assert completed.status_code == 200
    assert completed.json()["profile"]["account_status"] == "active"
