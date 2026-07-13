-- This query must return no rows before applying 001_remaining_portal_features.sql.
-- Resolve any duplicates manually by keeping one active match and closing the others.
select
  mentee_id as caregiver_id,
  count(*) as active_match_count,
  array_agg(id order by created_at) as match_ids
from public.matches
where status = 'active'
group by mentee_id
having count(*) > 1;
