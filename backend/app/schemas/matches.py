from typing import Literal

from pydantic import BaseModel, Field


class MatchRequestPayload(BaseModel):
    mentor_id: str = Field(min_length=1)
    care_type: str = Field(min_length=1, max_length=200)


class MentorDecisionPayload(BaseModel):
    decision: Literal["accept", "reject"]
