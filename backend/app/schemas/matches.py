from pydantic import BaseModel, Field


class MatchRequestPayload(BaseModel):
    mentor_id: str = Field(min_length=1)
    message: str = Field(min_length=1, max_length=3000)

