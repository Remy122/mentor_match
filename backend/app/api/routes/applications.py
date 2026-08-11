from fastapi import APIRouter, HTTPException, status

from app.core.supabase import get_supabase_client
from app.core.universities import normalize_ontario_postsecondary_institution
from app.schemas.applications import (
    ProgramApplicationCreate,
    ProgramApplicationCreateResponse,
)


router = APIRouter(prefix="/applications", tags=["applications"])


@router.post(
    "",
    response_model=ProgramApplicationCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    payload: ProgramApplicationCreate,
) -> ProgramApplicationCreateResponse:
    university = None
    if payload.university:
        university = normalize_ontario_postsecondary_institution(payload.university)
        if not university:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Select a valid Ontario university or college.",
            )

    application = payload.model_dump(mode="json")
    application["email"] = payload.email.lower()
    application["university"] = university

    if payload.application_type == "caregiver":
        for field in (
            "volunteer_motivation",
            "caregiving_experience",
            "other_relevant_experience",
            "school_program_interest",
        ):
            application[field] = None
    else:
        for field in (
            "caregiving_situation",
            "support_requested",
            "communication_preference",
            "accessibility_needs",
            "additional_information",
        ):
            application[field] = None

    result = get_supabase_client().table("program_applications").insert(application).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The application could not be saved. Please try again.",
        )

    return ProgramApplicationCreateResponse(message="Application submitted.")

