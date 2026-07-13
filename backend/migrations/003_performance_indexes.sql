-- Composite indexes for the portal's filtered lists and newest-first history.
create index if not exists idx_profiles_review_queue
on public.profiles (approval_status, role, created_at);

create index if not exists idx_profiles_visible_volunteer_directory
on public.profiles (created_at)
where role = 'mentor'
  and approval_status = 'approved'
  and is_visible = true;

create index if not exists idx_matches_mentor_created_at
on public.matches (mentor_id, created_at desc);

create index if not exists idx_matches_mentee_created_at
on public.matches (mentee_id, created_at desc);

create index if not exists idx_matches_status_created_at
on public.matches (status, created_at desc);

create index if not exists idx_volunteer_hours_mentor_meeting_date
on public.volunteer_hours (mentor_id, meeting_date desc);

create index if not exists idx_volunteer_hours_mentee_meeting_date
on public.volunteer_hours (mentee_id, meeting_date desc);
