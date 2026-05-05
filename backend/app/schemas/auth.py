from pydantic import BaseModel, Field


class ProfileSyncPayload(BaseModel):
    role: str = Field(pattern="^(admin|mentor|mentee)$")
    full_name: str = Field(min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)


class ProfileUpdatePayload(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)
    is_visible: bool | None = None

