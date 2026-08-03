alter table public.profiles
add column if not exists university text not null default 'University not selected';

update public.profiles
set university = 'University not selected'
where university is null or trim(university) = '';

alter table public.profiles
alter column university set default 'University not selected';

alter table public.profiles
alter column university set not null;

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

create index if not exists idx_profiles_visible_volunteer_university
on public.profiles (university, created_at)
where role = 'mentor'
  and approval_status = 'approved'
  and is_visible = true;

grant update (university) on public.profiles to authenticated;

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
    university,
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
    coalesce(nullif(trim(new.raw_user_meta_data->>'university'), ''), 'University not selected'),
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
