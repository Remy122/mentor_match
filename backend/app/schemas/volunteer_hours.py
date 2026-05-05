from datetime import date, datetime

from pydantic import BaseModel, Field


class VolunteerHoursPayload(BaseModel):
    match_id: str = Field(min_length=1)
    hours: float = Field(gt=0, le=24)
    session_date: date
    next_meeting_at: datetime | None = None
    topics_discussed: str = Field(min_length=1, max_length=4000)

