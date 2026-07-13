from pydantic import BaseModel, Field


class VolunteerHoursPayload(BaseModel):
    match_id: int
    meeting_date: str
    hours: float = Field(gt=0, le=24)
    next_meeting: str | None = None
    topics_discussed: str = Field(min_length=1, max_length=4000)
    anything_to_flag: str | None = Field(default=None, max_length=4000)
