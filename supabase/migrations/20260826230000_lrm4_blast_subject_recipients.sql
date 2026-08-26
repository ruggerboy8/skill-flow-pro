-- LRM-4: adds a subject line and per-send exclusion list to the weekly
-- doctor blast, so the send confirm can become a real recipient review
-- (see docs/specs/lrm-4-blast-recipient-review.md). Additive only -- no
-- other schema change, safe to (re)run any time.
--
-- excluded_staff_ids is a record of who was left out of a SENT blast, for
-- the row's own history. It is never read when building a NEW week's blast
-- (fresh-list rule) -- the recipients/send actions always re-derive the
-- full cohort from scratch.

alter table public.lead_week_blasts add column if not exists subject text not null default '';
alter table public.lead_week_blasts add column if not exists excluded_staff_ids uuid[] not null default '{}';

-- Sanity check: both columns exist with the expected types.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_week_blasts' and column_name = 'subject'
  ) then
    raise exception 'lead_week_blasts.subject was not created';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_week_blasts' and column_name = 'excluded_staff_ids'
  ) then
    raise exception 'lead_week_blasts.excluded_staff_ids was not created';
  end if;

  raise notice 'lead_week_blasts: OK (subject, excluded_staff_ids present)';
end $$;
