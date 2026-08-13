-- Unified applicant/account lifecycle, simplified admin workspace, match archives,
-- and private messaging for active matches.

alter table public.profiles
add column if not exists legal_name text;

alter table public.profiles
add column if not exists preferred_name text;

alter table public.profiles
add column if not exists phone_number text;

alter table public.profiles
add column if not exists program_application_id uuid
references public.program_applications(id) on delete set null;

alter table public.profiles
add column if not exists account_status text not null default 'active';

alter table public.profiles
add column if not exists onboarding_status text not null default 'ready';

alter table public.profiles
add column if not exists assigned_coordinator uuid
references public.profiles(id) on delete set null;

alter table public.profiles
add column if not exists stage_started_at timestamp with time zone not null default now();

alter table public.profiles
add column if not exists suspended_at timestamp with time zone;

alter table public.profiles
drop constraint if exists profiles_university_check;

alter table public.profiles
add constraint profiles_university_check
check (university in (
  'University not selected', 'Algoma University', 'Algonquin College',
  'Brock University', 'Cambrian College', 'Canadore College',
  'Carleton University', 'Centennial College', 'Collège Boréal',
  'Conestoga College', 'Confederation College', 'Durham College',
  'Fanshawe College', 'Fleming College', 'George Brown College',
  'Georgian College', 'Humber College', 'La Cité', 'Lakehead University',
  'Laurentian University', 'Loyalist College', 'McMaster University',
  'Mohawk College', 'Niagara College', 'Nipissing University',
  'Northern College', 'NOSM University', 'OCAD University', 'Ontario Tech University',
  'Queen''s University', 'Royal Military College of Canada', 'Sault College', 'Seneca Polytechnic',
  'Sheridan College', 'St. Clair College', 'St. Lawrence College',
  'Toronto Metropolitan University', 'Trent University', 'Université de Hearst',
  'Université de l''Ontario français',
  'University of Guelph', 'University of Ottawa', 'University of Toronto',
  'University of Waterloo', 'University of Windsor', 'Western University',
  'Wilfrid Laurier University', 'York University'
));

alter table public.profiles
drop constraint if exists profiles_account_status_check;

alter table public.profiles
add constraint profiles_account_status_check
check (account_status in ('invited', 'active', 'suspended', 'deleted'));

alter table public.profiles
drop constraint if exists profiles_onboarding_status_check;

alter table public.profiles
add constraint profiles_onboarding_status_check
check (onboarding_status in ('profile_pending', 'training', 'ready'));

create unique index if not exists profiles_program_application_unique
on public.profiles(program_application_id)
where program_application_id is not null;

create index if not exists idx_profiles_workspace_filters
on public.profiles(role, university, account_status, onboarding_status, is_visible);

update public.profiles
set
  preferred_name = coalesce(preferred_name, full_name),
  legal_name = coalesce(legal_name, full_name),
  account_status = case
    when approval_status = 'rejected' then 'suspended'
    else 'active'
  end,
  onboarding_status = case
    when approval_status = 'approved' then 'ready'
    when role = 'mentor' then 'training'
    else 'profile_pending'
  end
where preferred_name is null
   or legal_name is null;

alter table public.program_applications
add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.program_applications
add column if not exists invite_sent_at timestamp with time zone;

alter table public.program_applications
add column if not exists onboarding_status text not null default 'application_submitted';

alter table public.program_applications
drop constraint if exists program_applications_onboarding_status_check;

alter table public.program_applications
add constraint program_applications_onboarding_status_check
check (onboarding_status in (
  'application_submitted', 'under_review', 'invited', 'profile_pending',
  'training', 'ready', 'rejected', 'withdrawn'
));

create unique index if not exists program_applications_user_unique
on public.program_applications(user_id)
where user_id is not null;

alter table public.matches
add column if not exists requested_at timestamp with time zone;

alter table public.matches
add column if not exists activated_at timestamp with time zone;

alter table public.matches
add column if not exists closed_at timestamp with time zone;

alter table public.matches
add column if not exists closed_reason text;

update public.matches
set requested_at = coalesce(requested_at, created_at);

update public.matches
set activated_at = coalesce(activated_at, created_at)
where status = 'active';

update public.matches
set closed_at = coalesce(closed_at, created_at)
where status in ('completed', 'cancelled', 'declined', 'rejected');

alter table public.matches
drop constraint if exists matches_status_check;

update public.matches
set status = case
  when status = 'pending' then 'requested'
  when status = 'active' then 'active'
  else 'closed'
end
where status not in ('requested', 'active', 'closed');

alter table public.matches
add constraint matches_status_check
check (status in ('requested', 'active', 'closed'));

alter table public.matches
alter column status set default 'requested';

drop index if exists matches_one_active_per_caregiver;
create unique index matches_one_active_per_caregiver
on public.matches(mentee_id)
where status = 'active';

create table if not exists public.match_messages (
  id bigint generated by default as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_match_messages_match_created
on public.match_messages(match_id, created_at);

alter table public.match_messages enable row level security;
revoke all on public.match_messages from anon, authenticated;
grant all on public.match_messages to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_university text;
  requested_is_super_admin boolean;
  requested_application_id uuid;
  requested_onboarding text;
begin
  requested_is_super_admin := lower(new.email) in (
    'jayhung005@gmail.com',
    'yremy00511@gmail.com'
  );

  requested_role := case
    when requested_is_super_admin then 'admin'
    when new.raw_user_meta_data->>'role' = 'mentor' then 'mentor'
    else 'mentee'
  end;

  requested_university := coalesce(
    nullif(trim(new.raw_user_meta_data->>'university'), ''),
    'University not selected'
  );

  requested_application_id := nullif(
    trim(new.raw_user_meta_data->>'program_application_id'),
    ''
  )::uuid;

  requested_onboarding := case
    when requested_is_super_admin then 'ready'
    when requested_role = 'mentor' then 'training'
    else 'profile_pending'
  end;

  insert into public.profiles (
    id, role, username, full_name, legal_name, preferred_name, phone_number,
    bio, profile_picture_url, university, approval_status, is_visible,
    same_university_only, is_super_admin, program_application_id,
    account_status, onboarding_status, stage_started_at
  )
  values (
    new.id,
    requested_role,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'preferred_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      'New User'
    ),
    nullif(trim(new.raw_user_meta_data->>'legal_name'), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'preferred_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), '')
    ),
    nullif(trim(new.raw_user_meta_data->>'phone_number'), ''),
    null,
    null,
    requested_university,
    case when requested_is_super_admin then 'approved' else 'pending' end,
    false,
    true,
    requested_is_super_admin,
    requested_application_id,
    case when requested_is_super_admin then 'active' else 'invited' end,
    requested_onboarding,
    now()
  );

  if requested_role = 'mentor' then
    insert into public.mentor_profiles(id, skills, availability)
    values (new.id, null, null)
    on conflict (id) do nothing;
  elsif requested_role = 'mentee' then
    insert into public.mentee_profiles(id, goals, interests)
    values (new.id, null, null)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
