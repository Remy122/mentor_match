alter table public.profiles
add column if not exists username text;

alter table public.profiles
alter column is_visible set default false;

update public.profiles
set is_visible = false
where role <> 'mentor' or approval_status <> 'approved';

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

alter table public.matches
add column if not exists care_type text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data->>'role' = 'mentor' then 'mentor'
    else 'mentee'
  end;

  insert into public.profiles (
    id,
    role,
    username,
    full_name,
    bio,
    profile_picture_url,
    approval_status,
    is_visible
  )
  values (
    new.id,
    requested_role,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New User'),
    nullif(trim(new.raw_user_meta_data->>'bio'), ''),
    nullif(trim(new.raw_user_meta_data->>'profile_picture_url'), ''),
    'pending',
    false
  );

  if requested_role = 'mentor' then
    insert into public.mentor_profiles (id, skills, availability)
    values (
      new.id,
      case
        when jsonb_typeof(new.raw_user_meta_data->'skills') = 'array'
          then array(
            select jsonb_array_elements_text(new.raw_user_meta_data->'skills')
          )
        else null
      end,
      nullif(trim(new.raw_user_meta_data->>'availability'), '')
    );
  else
    insert into public.mentee_profiles (id, goals, interests)
    values (
      new.id,
      nullif(trim(new.raw_user_meta_data->>'goals'), ''),
      case
        when jsonb_typeof(new.raw_user_meta_data->'interests') = 'array'
          then array(
            select jsonb_array_elements_text(new.raw_user_meta_data->'interests')
          )
        else null
      end
    );
  end if;

  return new;
end;
$$;

alter table public.matches
drop constraint if exists matches_status_check;

alter table public.matches
add constraint matches_status_check
check (status in ('pending', 'active', 'declined', 'cancelled', 'rejected', 'completed'));

alter table public.matches
alter column status set default 'pending';

create unique index if not exists matches_one_active_per_caregiver
on public.matches (mentee_id)
where status = 'active';

alter table public.volunteer_hours
add column if not exists anything_to_flag text;

alter table public.volunteer_hours
alter column next_meeting type timestamp with time zone
using next_meeting::timestamptz;

alter table public.volunteer_hours
drop constraint if exists volunteer_hours_hours_range_check;

alter table public.volunteer_hours
add constraint volunteer_hours_hours_range_check
check (hours <= 24);

create or replace function public.is_approved_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and approval_status = 'approved'
  );
$$;

create or replace function public.is_approved_role(user_id uuid, expected_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = expected_role
      and approval_status = 'approved'
  );
$$;

create or replace function public.is_available_volunteer(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'mentor'
      and approval_status = 'approved'
      and is_visible = true
  );
$$;

create or replace function public.is_active_match(
  target_match_id bigint,
  target_mentor_id uuid,
  target_mentee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches
    where id = target_match_id
      and mentor_id = target_mentor_id
      and mentee_id = target_mentee_id
      and status = 'active'
  );
$$;

drop policy if exists "Approved mentees can view approved visible mentors"
on public.profiles;
drop policy if exists "Approved users can view approved visible mentors"
on public.profiles;

create policy "Approved users can view approved visible mentors"
on public.profiles
for select
using (
  role = 'mentor'
  and approval_status = 'approved'
  and is_visible = true
  and public.is_approved_user(auth.uid())
);

drop policy if exists "Approved users can view visible mentor details"
on public.mentor_profiles;
drop policy if exists "Approved users can view visible volunteer details"
on public.mentor_profiles;

create policy "Approved users can view visible volunteer details"
on public.mentor_profiles
for select
using (
  public.is_available_volunteer(mentor_profiles.id)
  and public.is_approved_user(auth.uid())
);

drop policy if exists "Approved mentees can create match requests"
on public.matches;
drop policy if exists "Approved caregivers can create pending match requests"
on public.matches;

create policy "Approved caregivers can create pending match requests"
on public.matches
for insert
with check (
  auth.uid() = mentee_id
  and status = 'pending'
  and public.is_approved_role(auth.uid(), 'mentee')
  and public.is_available_volunteer(mentor_id)
);

drop policy if exists "Mentors can log their own volunteer hours"
on public.volunteer_hours;
drop policy if exists "Approved volunteers can log active match hours"
on public.volunteer_hours;

create policy "Approved volunteers can log active match hours"
on public.volunteer_hours
for insert
with check (
  auth.uid() = mentor_id
  and public.is_approved_role(auth.uid(), 'mentor')
  and public.is_active_match(match_id, mentor_id, mentee_id)
);

revoke update on public.profiles from authenticated;
grant update (username, full_name, bio, profile_picture_url, is_visible)
on public.profiles to authenticated;
