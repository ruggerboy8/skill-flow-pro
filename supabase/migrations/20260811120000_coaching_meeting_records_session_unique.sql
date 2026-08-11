-- Add a unique constraint on coaching_meeting_records.session_id so that
-- prep-time upserts (DirectorPrepComposer, prior_action_status) and
-- capture-time upserts (MeetingOutcomeCapture) agree on one record per
-- session instead of racing an insert against an upsert.
-- Verified live 2026-08-11: zero duplicate session_id rows exist.
do $$
begin
  if exists (
    select 1 from coaching_meeting_records
    group by session_id having count(*) > 1
  ) then
    raise exception 'dedupe coaching_meeting_records before adding the unique constraint';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'coaching_meeting_records_session_id_key'
  ) then
    alter table coaching_meeting_records
      add constraint coaching_meeting_records_session_id_key unique (session_id);
  end if;
end $$;
