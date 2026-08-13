from __future__ import annotations

from app.api.routes import admin as admin_routes
from app.api.routes import applications as application_routes
from app.core.auth import AuthUser, require_admin_role
from app.main import app


def _wire_supabase(monkeypatch, fake_supabase):
    monkeypatch.setattr(
        application_routes,
        "get_supabase_client",
        lambda: fake_supabase,
    )
    monkeypatch.setattr(
        admin_routes,
        "get_supabase_client",
        lambda: fake_supabase,
    )


def test_create_caregiver_application_without_school(
    client,
    fake_supabase,
    monkeypatch,
):
    _wire_supabase(monkeypatch, fake_supabase)

    response = client.post(
        "/api/applications",
        json={
            "application_type": "caregiver",
            "full_legal_name": "Casey Caregiver",
            "preferred_name": "Casey",
            "email": "CASEY@example.com",
            "phone_number": "416-555-0100",
            "date_of_birth": "2002-04-15",
            "university": None,
            "caregiving_situation": "I care for a parent while working.",
            "support_requested": "Someone who understands burnout.",
            "communication_preference": "Text",
            "accessibility_needs": None,
            "consent_acknowledged": True,
        },
    )

    assert response.status_code == 201
    saved = fake_supabase.tables["program_applications"][0]
    assert saved["application_type"] == "caregiver"
    assert saved["email"] == "casey@example.com"
    assert saved["university"] is None
    assert saved["volunteer_motivation"] is None


def test_create_volunteer_application_with_college(
    client,
    fake_supabase,
    monkeypatch,
):
    _wire_supabase(monkeypatch, fake_supabase)

    response = client.post(
        "/api/applications",
        json={
            "application_type": "volunteer",
            "full_legal_name": "Morgan Volunteer",
            "preferred_name": "Morgan",
            "email": "morgan@example.com",
            "phone_number": "647-555-0100",
            "date_of_birth": "2001-09-08",
            "university": "Humber College",
            "volunteer_motivation": "I want to support other caregivers.",
            "caregiving_experience": "I cared for a sibling throughout school.",
            "other_relevant_experience": "Peer facilitation.",
            "school_program_interest": None,
            "consent_acknowledged": True,
        },
    )

    assert response.status_code == 201
    saved = fake_supabase.tables["program_applications"][0]
    assert saved["university"] == "Humber College"
    assert saved["caregiving_situation"] is None


def test_application_rejects_missing_role_fields_and_invalid_school(
    client,
    fake_supabase,
    monkeypatch,
):
    _wire_supabase(monkeypatch, fake_supabase)

    missing_consent = client.post(
        "/api/applications",
        json={
            "application_type": "caregiver",
            "full_legal_name": "Casey Caregiver",
            "preferred_name": "Casey",
            "email": "casey@example.com",
            "phone_number": "416-555-0100",
            "date_of_birth": "2002-04-15",
            "caregiving_situation": "I care for a parent.",
            "support_requested": "Peer support.",
            "communication_preference": "Email",
            "consent_acknowledged": False,
        },
    )
    assert missing_consent.status_code == 422

    invalid_school = client.post(
        "/api/applications",
        json={
            "application_type": "volunteer",
            "full_legal_name": "Morgan Volunteer",
            "preferred_name": "Morgan",
            "email": "morgan@example.com",
            "phone_number": "647-555-0100",
            "date_of_birth": "2001-09-08",
            "university": "Not a listed institution",
            "volunteer_motivation": "I want to help.",
            "caregiving_experience": "I supported a family member.",
            "consent_acknowledged": True,
        },
    )
    assert invalid_school.status_code == 422


def test_admin_lists_scoped_applications_and_reviews_one(
    client,
    fake_supabase,
    monkeypatch,
):
    _wire_supabase(monkeypatch, fake_supabase)
    fake_supabase.tables["program_applications"] = [
        {
            "id": "application-toronto",
            "application_type": "volunteer",
            "full_legal_name": "Toronto Volunteer",
            "preferred_name": "Taylor",
            "email": "taylor@example.com",
            "phone_number": "416-555-0101",
            "date_of_birth": "2001-01-01",
            "university": "University of Toronto",
            "volunteer_motivation": "I want to help.",
            "caregiving_experience": "I supported a parent.",
            "consent_acknowledged": True,
            "status": "pending",
            "created_at": "2026-08-11T12:00:00Z",
        },
        {
            "id": "application-waterloo",
            "application_type": "caregiver",
            "full_legal_name": "Waterloo Caregiver",
            "preferred_name": "Casey",
            "email": "casey@example.com",
            "phone_number": "519-555-0101",
            "date_of_birth": "2002-01-01",
            "university": "University of Waterloo",
            "caregiving_situation": "I support a sibling.",
            "support_requested": "Peer support.",
            "communication_preference": "Text",
            "consent_acknowledged": True,
            "status": "pending",
            "created_at": "2026-08-11T12:00:00Z",
        },
    ]
    app.dependency_overrides[require_admin_role] = lambda: AuthUser(
        id="admin-toronto",
        email="admin@example.com",
        claims={},
        role="admin",
        university="University of Toronto",
        approval_status="approved",
        is_super_admin=False,
    )

    response = client.get("/api/admin/program-applications?review_state=pending")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["applications"]] == [
        "application-toronto"
    ]

    review_response = client.post(
        "/api/admin/program-applications/application-toronto/approve"
    )
    assert review_response.status_code == 200
    reviewed = fake_supabase.tables["program_applications"][0]
    assert reviewed["status"] == "approved"
    assert reviewed["reviewed_by"] == "admin-toronto"

    cross_university_review = client.post(
        "/api/admin/program-applications/application-waterloo/reject"
    )
    assert cross_university_review.status_code == 404
