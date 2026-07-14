# OCGO Workspace

This repository is split into dedicated app directories:

- `frontend/` - Next.js web application
- `backend/` - FastAPI backend service using Supabase and Resend

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

Supabase Auth setup:

- In the Supabase dashboard, open Authentication > Providers > Email.
- Turn off `Confirm email`. The portal uses immediate email/password signup;
  admin profile approval remains the gate before a new user can access portal
  features.

## Backend (FastAPI)

See `backend/README.md` for database migrations, environment setup, and local commands.
