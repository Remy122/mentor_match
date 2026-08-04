-- Keep the designated super-admin stable across account wipes and future signups.

update public.profiles p
set
  role = 'admin',
  approval_status = 'approved',
  is_visible = false,
  is_super_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = 'jayhung005@gmail.com';

delete from public.mentor_profiles
where id in (
  select id
  from auth.users
  where lower(email) = 'jayhung005@gmail.com'
);

delete from public.mentee_profiles
where id in (
  select id
  from auth.users
  where lower(email) = 'jayhung005@gmail.com'
);

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

notify pgrst, 'reload schema';
