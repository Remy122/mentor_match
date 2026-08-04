from typing import Literal

from pydantic import BaseModel, Field


AccountRole = Literal["admin", "mentor", "mentee"]
MemberRole = Literal["mentor", "mentee"]
ApprovalStatus = Literal["pending", "approved", "rejected"]


class PreapprovedEmailCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: MemberRole
    university: str = Field(min_length=1, max_length=120)


class AdminProfileCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=72)
    role: AccountRole
    username: str = Field(
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    full_name: str = Field(min_length=1, max_length=120)
    university: str = Field(min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    approval_status: ApprovalStatus = "approved"
    is_visible: bool = False
    same_university_only: bool = True
    availability: str | None = Field(default=None, max_length=500)
    goals: str | None = Field(default=None, max_length=2000)
    interests: list[str] | None = None


class AdminProfileUpdate(BaseModel):
    role: AccountRole | None = None
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    university: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    approval_status: ApprovalStatus | None = None
    is_visible: bool | None = None
    same_university_only: bool | None = None
    availability: str | None = Field(default=None, max_length=500)
    goals: str | None = Field(default=None, max_length=2000)
    interests: list[str] | None = None
