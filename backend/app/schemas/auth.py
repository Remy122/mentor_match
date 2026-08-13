from typing import Literal

from pydantic import BaseModel, Field


class ProfileSyncRequest(BaseModel):
    role: Literal["mentor", "mentee"] | None = None
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    profile_picture_url: str | None = Field(default=None, max_length=500)
    university: str | None = Field(default=None, min_length=1, max_length=120)
    same_university_only: bool | None = None
    skills: list[str] | None = None
    availability: str | None = Field(default=None, max_length=500)
    goals: str | None = Field(default=None, max_length=2000)
    interests: list[str] | None = None


class ProfileUpdateRequest(BaseModel):
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    profile_picture_url: str | None = Field(default=None, max_length=500)
    university: str | None = Field(default=None, min_length=1, max_length=120)
    is_visible: bool | None = None
    same_university_only: bool | None = None
    skills: list[str] | None = None
    availability: str | None = Field(default=None, max_length=500)
    goals: str | None = Field(default=None, max_length=2000)
    interests: list[str] | None = None


class MeResponse(BaseModel):
    profile: dict
    mentor_profile: dict | None = None
    mentee_profile: dict | None = None
    application: dict | None = None
