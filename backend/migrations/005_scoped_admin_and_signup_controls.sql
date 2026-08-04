-- University-scoped visibility, preapproved signups, and super-admin support.

alter table public.profiles
add column if not exists same_university_only boolean not null default true;

alter table public.profiles
add column if not exists is_super_admin boolean not null default false;

update public.profiles
set same_university_only = true
where role = 'mentor' and same_university_only is null;

update public.profiles p
set
  role = 'admin',
  approval_status = 'approved',
  is_visible = false,
  is_super_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = 'jayhung005@gmail.com';

alter table public.profiles
drop constraint if exists profiles_university_check;

alter table public.profiles
add constraint profiles_university_check
check (
  university in (
    'University not selected',
    'Algoma University',
    'Brock University',
    'Carleton University',
    'University of Guelph',
    'Université de Hearst',
    'Lakehead University',
    'Laurentian University',
    'McMaster University',
    'Nipissing University',
    'NOSM University',
    'OCAD University',
    'Université de l''Ontario français',
    'Ontario Tech University',
    'University of Ottawa',
    'Queen''s University',
    'Royal Military College of Canada',
    'University of Toronto',
    'Toronto Metropolitan University',
    'Trent University',
    'University of Waterloo',
    'Western University',
    'Wilfrid Laurier University',
    'University of Windsor',
    'York University'
  )
);

create table if not exists public.preapproved_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('mentor', 'mentee')),
  university text not null,
  created_by uuid references public.profiles(id) on delete set null,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint preapproved_emails_university_check check (
    university in (
      'Algoma University',
      'Brock University',
      'Carleton University',
      'University of Guelph',
      'Université de Hearst',
      'Lakehead University',
      'Laurentian University',
      'McMaster University',
      'Nipissing University',
      'NOSM University',
      'OCAD University',
      'Université de l''Ontario français',
      'Ontario Tech University',
      'University of Ottawa',
      'Queen''s University',
      'Royal Military College of Canada',
      'University of Toronto',
      'Toronto Metropolitan University',
      'Trent University',
      'University of Waterloo',
      'Western University',
      'Wilfrid Laurier University',
      'University of Windsor',
      'York University'
    )
  )
);

create unique index if not exists preapproved_emails_lower_unique
on public.preapproved_emails (lower(email));

create index if not exists idx_profiles_admin_university
on public.profiles (university, role, approval_status);

create index if not exists idx_preapproved_emails_university
on public.preapproved_emails (university, claimed_at);

alter table public.preapproved_emails enable row level security;

revoke all on public.preapproved_emails from anon, authenticated;

create or replace function public.can_view_volunteer(
  viewer_id uuid,
  volunteer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles viewer
    join public.profiles volunteer on volunteer.id = volunteer_id
    where viewer.id = viewer_id
      and viewer.approval_status = 'approved'
      and volunteer.role = 'mentor'
      and volunteer.approval_status = 'approved'
      and volunteer.is_visible = true
      and (
        (
          viewer.role = 'mentee'
          and (
            volunteer.same_university_only = false
            or viewer.university = volunteer.university
          )
        )
        or (
          viewer.role = 'admin'
          and (
            viewer.is_super_admin = true
            or viewer.university = volunteer.university
          )
        )
      )
  );
$$;

create or replace function public.admin_can_manage_profile(
  admin_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles admin_profile
    join public.profiles target_profile on target_profile.id = target_profile_id
    where admin_profile.id = admin_id
      and admin_profile.role = 'admin'
      and admin_profile.approval_status = 'approved'
      and (
        admin_profile.is_super_admin = true
        or (
          target_profile.role in ('mentor', 'mentee')
          and target_profile.university = admin_profile.university
        )
      )
  );
$$;

create or replace function public.admin_can_manage_pair(
  admin_id uuid,
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
    from public.profiles admin_profile
    join public.profiles mentor on mentor.id = target_mentor_id
    join public.profiles mentee on mentee.id = target_mentee_id
    where admin_profile.id = admin_id
      and admin_profile.role = 'admin'
      and admin_profile.approval_status = 'approved'
      and (
        admin_profile.is_super_admin = true
        or (
          mentor.university = admin_profile.university
          and mentee.university = admin_profile.university
        )
      )
  );
$$;

drop policy if exists "Users can update their own basic profile"
on public.profiles;

create policy "Users can update their own basic profile"
on public.profiles
for update
using (auth.uid() = id and role in ('mentor', 'mentee'))
with check (auth.uid() = id and role in ('mentor', 'mentee'));

drop policy if exists "Admins can view all profiles"
on public.profiles;
drop policy if exists "Admins can view scoped profiles"
on public.profiles;

create policy "Admins can view scoped profiles"
on public.profiles
for select
using (public.admin_can_manage_profile(auth.uid(), profiles.id));

drop policy if exists "Admins can update all profiles"
on public.profiles;
drop policy if exists "Admins can update scoped profiles"
on public.profiles;

drop policy if exists "Admins can view all mentor profiles"
on public.mentor_profiles;
drop policy if exists "Admins can view scoped mentor profiles"
on public.mentor_profiles;

create policy "Admins can view scoped mentor profiles"
on public.mentor_profiles
for select
using (public.admin_can_manage_profile(auth.uid(), mentor_profiles.id));

drop policy if exists "Admins can manage mentor profiles"
on public.mentor_profiles;
drop policy if exists "Admins can manage scoped mentor profiles"
on public.mentor_profiles;

drop policy if exists "Admins can view all mentee profiles"
on public.mentee_profiles;
drop policy if exists "Admins can view scoped mentee profiles"
on public.mentee_profiles;

create policy "Admins can view scoped mentee profiles"
on public.mentee_profiles
for select
using (public.admin_can_manage_profile(auth.uid(), mentee_profiles.id));

drop policy if exists "Admins can manage mentee profiles"
on public.mentee_profiles;
drop policy if exists "Admins can manage scoped mentee profiles"
on public.mentee_profiles;

drop policy if exists "Admins can view all matches"
on public.matches;
drop policy if exists "Admins can view scoped matches"
on public.matches;

create policy "Admins can view scoped matches"
on public.matches
for select
using (
  public.admin_can_manage_pair(auth.uid(), matches.mentor_id, matches.mentee_id)
);

drop policy if exists "Admins can update matches"
on public.matches;
drop policy if exists "Admins can update scoped matches"
on public.matches;

drop policy if exists "Admins can delete matches"
on public.matches;
drop policy if exists "Admins can delete scoped matches"
on public.matches;

drop policy if exists "Admins can view all volunteer hours"
on public.volunteer_hours;
drop policy if exists "Admins can view scoped volunteer hours"
on public.volunteer_hours;

create policy "Admins can view scoped volunteer hours"
on public.volunteer_hours
for select
using (
  public.admin_can_manage_pair(
    auth.uid(),
    volunteer_hours.mentor_id,
    volunteer_hours.mentee_id
  )
);

drop policy if exists "Admins can manage volunteer hours"
on public.volunteer_hours;
drop policy if exists "Admins can manage scoped volunteer hours"
on public.volunteer_hours;

drop policy if exists "Approved users can view approved visible mentors"
on public.profiles;
drop policy if exists "Approved caregivers and admins can view available volunteers"
on public.profiles;

create policy "Approved caregivers and admins can view available volunteers"
on public.profiles
for select
using (
  role = 'mentor'
  and public.can_view_volunteer(auth.uid(), profiles.id)
);

drop policy if exists "Approved users can view visible volunteer details"
on public.mentor_profiles;
drop policy if exists "Approved caregivers and admins can view volunteer details"
on public.mentor_profiles;

create policy "Approved caregivers and admins can view volunteer details"
on public.mentor_profiles
for select
using (public.can_view_volunteer(auth.uid(), mentor_profiles.id));

drop policy if exists "Approved caregivers can create pending match requests"
on public.matches;
drop policy if exists "Approved caregivers can create scoped pending requests"
on public.matches;

create policy "Approved caregivers can create scoped pending requests"
on public.matches
for insert
with check (
  auth.uid() = mentee_id
  and status = 'pending'
  and public.is_approved_role(auth.uid(), 'mentee')
  and public.can_view_volunteer(auth.uid(), mentor_id)
);

revoke update on public.profiles from authenticated;
revoke update (
  username,
  full_name,
  bio,
  profile_picture_url,
  university,
  is_visible,
  same_university_only
) on public.profiles from authenticated;
grant update (
  username,
  full_name,
  bio,
  university,
  is_visible,
  same_university_only
) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.preapproved_emails%rowtype;
  requested_role text;
  requested_university text;
  initial_approval text;
  requested_is_super_admin boolean;
begin
  requested_is_super_admin := lower(new.email) = 'jayhung005@gmail.com';

  select *
  into invite
  from public.preapproved_emails
  where lower(email) = lower(new.email)
    and claimed_at is null
  limit 1;

  requested_role := case
    when requested_is_super_admin then 'admin'
    when invite.id is not null then invite.role
    when new.raw_user_meta_data->>'role' = 'mentor' then 'mentor'
    else 'mentee'
  end;

  requested_university := coalesce(
    invite.university,
    nullif(trim(new.raw_user_meta_data->>'university'), ''),
    'University not selected'
  );

  initial_approval := case
    when requested_is_super_admin then 'approved'
    when invite.id is not null then 'approved'
    else 'pending'
  end;

  insert into public.profiles (
    id,
    role,
    username,
    full_name,
    bio,
    profile_picture_url,
    university,
    approval_status,
    is_visible,
    same_university_only,
    is_super_admin
  )
  values (
    new.id,
    requested_role,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New User'),
    nullif(trim(new.raw_user_meta_data->>'bio'), ''),
    null,
    requested_university,
    initial_approval,
    requested_role = 'mentor' and initial_approval = 'approved',
    true,
    requested_is_super_admin
  );

  if requested_role = 'mentor' then
    insert into public.mentor_profiles (id, skills, availability)
    values (
      new.id,
      null,
      nullif(trim(new.raw_user_meta_data->>'availability'), '')
    );
  elsif requested_role = 'mentee' then
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

  if invite.id is not null then
    update public.preapproved_emails
    set claimed_by = new.id, claimed_at = now()
    where id = invite.id;
  end if;

  return new;
end;
$$;
