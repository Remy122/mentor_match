from fastapi import APIRouter

from app.api.routes import admin, applications, auth, matches, volunteer_hours

api_router = APIRouter()
api_router.include_router(applications.router)
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(matches.router)
api_router.include_router(volunteer_hours.router)
