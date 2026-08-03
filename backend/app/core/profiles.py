from typing import Any, Iterable


PROFILE_COLUMNS = (
    "id,role,username,full_name,bio,profile_picture_url,"
    "university,approval_status,is_visible,created_at"
)


def get_profile(
    supabase: Any,
    user_id: str,
    columns: str = PROFILE_COLUMNS,
) -> dict[str, Any] | None:
    result = (
        supabase.table("profiles")
        .select(columns)
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_profiles_by_ids(
    supabase: Any,
    user_ids: Iterable[str | None],
    columns: str = PROFILE_COLUMNS,
) -> dict[str, dict[str, Any]]:
    unique_ids = sorted({user_id for user_id in user_ids if user_id})
    if not unique_ids:
        return {}

    result = (
        supabase.table("profiles")
        .select(columns)
        .in_("id", unique_ids)
        .execute()
    )
    return {profile["id"]: profile for profile in (result.data or [])}


def get_role_profile(
    supabase: Any,
    user_id: str,
    role: str,
) -> dict[str, Any] | None:
    if role == "mentor":
        table_name = "mentor_profiles"
        columns = "id,skills,availability,total_hours"
    elif role == "mentee":
        table_name = "mentee_profiles"
        columns = "id,goals,interests"
    else:
        return None

    result = (
        supabase.table(table_name)
        .select(columns)
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_auth_email(supabase: Any, user_id: str) -> str | None:
    try:
        result = supabase.auth.admin.get_user_by_id(user_id)
        user = getattr(result, "user", None)
        return getattr(user, "email", None)
    except Exception:
        return None
