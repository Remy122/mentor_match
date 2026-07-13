# Backend Service

FastAPI service for the OCGO caregiver and volunteer matching portal.

## Stack

- FastAPI (API layer)
- Supabase Auth + Postgres (identity and data)
- Resend (account and match notifications)

## Current Structure

- `app/main.py` - FastAPI app + CORS + `/health`
- `app/api/router.py` - top-level API router
- `app/api/routes/auth.py` - profile and authentication routes
- `app/api/routes/admin.py` - approvals, dashboard, and oversight
- `app/api/routes/matches.py` - volunteer browsing and match lifecycle
- `app/api/routes/volunteer_hours.py` - volunteer-hour logs
- `app/core/config.py` - environment settings
- `app/core/auth.py` - Supabase JWT and role guards

## Run Locally

1. Apply the SQL files in `migrations/` in numeric order.
2. Create and activate a virtual environment.
3. Install dependencies:
   - `pip install -r requirements.txt`
4. Copy env template:
   - `copy .env.example .env`
5. Start dev server:
   - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
