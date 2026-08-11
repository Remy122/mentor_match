from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ProgramApplicationCreate(BaseModel):
    application_type: Literal["caregiver", "volunteer"]
    full_legal_name: str = Field(min_length=1, max_length=120)
    preferred_name: str = Field(min_length=1, max_length=120)
    email: str = Field(
        min_length=3,
        max_length=254,
        pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
    )
    phone_number: str = Field(min_length=7, max_length=40)
    date_of_birth: date
    university: str | None = Field(default=None, max_length=160)
    caregiving_situation: str | None = Field(default=None, max_length=2000)
    support_requested: str | None = Field(default=None, max_length=2000)
    communication_preference: Literal[
        "Text",
        "Email",
        "Phone call",
        "Video call",
        "No preference",
    ] | None = None
    accessibility_needs: str | None = Field(default=None, max_length=2000)
    additional_information: str | None = Field(default=None, max_length=2000)
    volunteer_motivation: str | None = Field(default=None, max_length=2000)
    caregiving_experience: str | None = Field(default=None, max_length=2000)
    other_relevant_experience: str | None = Field(default=None, max_length=2000)
    school_program_interest: str | None = Field(default=None, max_length=2000)
    consent_acknowledged: bool

    @field_validator(
        "full_legal_name",
        "preferred_name",
        "email",
        "phone_number",
        "university",
        "caregiving_situation",
        "support_requested",
        "accessibility_needs",
        "additional_information",
        "volunteer_motivation",
        "caregiving_experience",
        "other_relevant_experience",
        "school_program_interest",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_in_the_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return value

    @model_validator(mode="after")
    def validate_application_type_fields(self) -> "ProgramApplicationCreate":
        if not self.consent_acknowledged:
            raise ValueError("Consent is required before submitting an application.")

        if self.application_type == "caregiver":
            if not self.caregiving_situation:
                raise ValueError("Caregiving situation is required.")
            if not self.support_requested:
                raise ValueError("Requested support is required.")
            if not self.communication_preference:
                raise ValueError("Communication preference is required.")
        else:
            if not self.university:
                raise ValueError("University or post-secondary institution is required.")
            if not self.volunteer_motivation:
                raise ValueError("Volunteer motivation is required.")
            if not self.caregiving_experience:
                raise ValueError("Caregiving experience is required.")

        return self


class ProgramApplicationCreateResponse(BaseModel):
    message: str
