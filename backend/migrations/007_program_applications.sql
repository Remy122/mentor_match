-- Public caregiver and volunteer interest forms based on the QYCC application flow.
-- Submit through the backend service-role endpoint; clients cannot read or write this table directly.

create extension if not exists pgcrypto;

create table if not exists public.program_applications (
  id uuid primary key default gen_random_uuid(),
  application_type text not null check (application_type in ('caregiver', 'volunteer')),
  full_legal_name text not null check (char_length(trim(full_legal_name)) between 1 and 120),
  preferred_name text not null check (char_length(trim(preferred_name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 254),
  phone_number text not null check (char_length(trim(phone_number)) between 7 and 40),
  date_of_birth date not null check (date_of_birth <= current_date),
  university text,

  -- Caregiver-only fields
  caregiving_situation text,
  support_requested text,
  communication_preference text check (
    communication_preference in ('Text', 'Email', 'Phone call', 'Video call', 'No preference')
  ),
  accessibility_needs text,
  additional_information text,

  -- Volunteer-only fields
  volunteer_motivation text,
  caregiving_experience text,
  other_relevant_experience text,
  school_program_interest text,

  consent_acknowledged boolean not null check (consent_acknowledged = true),
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'approved', 'rejected', 'withdrawn')
  ),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint program_applications_required_role_fields check (
    (
      application_type = 'caregiver'
      and caregiving_situation is not null
      and char_length(trim(caregiving_situation)) > 0
      and support_requested is not null
      and char_length(trim(support_requested)) > 0
      and communication_preference is not null
    )
    or
    (
      application_type = 'volunteer'
      and university is not null
      and char_length(trim(university)) > 0
      and volunteer_motivation is not null
      and char_length(trim(volunteer_motivation)) > 0
      and caregiving_experience is not null
      and char_length(trim(caregiving_experience)) > 0
    )
  )
);

create index if not exists idx_program_applications_status_created
on public.program_applications (status, created_at desc);

create index if not exists idx_program_applications_type_status
on public.program_applications (application_type, status);

create or replace function public.set_program_application_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_program_application_updated_at on public.program_applications;
create trigger set_program_application_updated_at
before update on public.program_applications
for each row execute function public.set_program_application_updated_at();

alter table public.program_applications enable row level security;

revoke all on public.program_applications from anon, authenticated;
grant all on public.program_applications to service_role;
