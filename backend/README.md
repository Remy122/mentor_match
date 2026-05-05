# Backend Service

backend for the OCGO mentor platform.

## Stack

- FastAPI (API layer)
- Supabase Auth + Postgres (identity and data)

TODO:
Email send functionality

## Current Structure

- `app/main.py` - FastAPI app + CORS + `/health`
- `app/api/router.py` - top-level API router
- `app/api/routes/auth.py` - profile/auth route stubs
- `app/api/routes/admin.py` - approval/dashboard route stubs
- `app/api/routes/matches.py` - mentor browse/match route stubs
- `app/api/routes/volunteer_hours.py` - volunteer hours route stubs
- `app/core/config.py` - environment settings
- `app/core/auth.py` - temporary auth/admin guards (replace with JWT verification)

## Run Locally

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Copy env template:
   - `copy .env.example .env`
4. Start dev server:
   - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
