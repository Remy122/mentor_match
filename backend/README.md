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

1. Apply the SQL files in `migrations/` in numeric order. Migration `007` adds
   the private caregiver and volunteer application table used by the public
   forms. Migration `008` adds invitation/onboarding stages, unified people
   records, requested/active/closed match archives, and private messaging for
   active matches. The application invitation flow replaces public
   preapproval-based signups.
2. Create and activate a virtual environment.
3. Install dependencies:
   - `pip install -r requirements.txt`
4. Copy env template:
   - `copy .env.example .env`
   - Set `SUPABASE_SERVICE_ROLE_KEY` so the backend can write public form
     submissions to the RLS-protected application table.
5. Start dev server:
   - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

## Database schema mismatch

If `/api/auth/me` fails with an error such as
`column profiles.legal_name does not exist`, the backend is connected to a
Supabase project where migration `008_unified_onboarding_workspace_and_messages.sql`
has not been applied. Run the complete migration in the Supabase SQL Editor,
confirm that it finishes successfully, and then retry the request. Restarting
the Python virtual environment does not add or update database columns.
