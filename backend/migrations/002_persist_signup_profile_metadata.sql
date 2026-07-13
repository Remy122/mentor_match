-- Preserve the complete volunteer/caregiver application when email confirmation
-- prevents the frontend from calling the authenticated profile-sync endpoint.
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
