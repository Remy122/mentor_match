from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.core.config import settings

app = FastAPI(title="OCGO Backend", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
development_origin_regex = (
    r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$"
    if settings.app_env.lower() != "production"
    else None
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=development_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


app.include_router(api_router, prefix="/api")
