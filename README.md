# OCGO Workspace

This repository is split into dedicated app directories:

- `frontend/` - Next.js web application
- `backend/` - FastAPI backend service (Supabase + Resend integration target)

## Frontend (Next.js)

Run the app from the `frontend` directory:

```bash
cd frontend
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Frontend env setup:

- Copy `frontend/.env.example` to `frontend/.env.local`
- Set:
  - `NEXT_PUBLIC_BACKEND_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Backend (FastAPI)

The `backend` folder is reserved for the Python API service. See `backend/README.md` for the planned structure.
