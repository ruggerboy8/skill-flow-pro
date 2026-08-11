-- Persist the pasted meeting transcript when a coach uses AI Transcript
-- Assist in outcome capture. Previously it was fed to the summarizer and
-- discarded (verified live 2026-08-11: 0 transcripts existed anywhere).
-- John: persist everywhere, all orgs — low enough usage that the exposure
-- risk is small. Coach/CD/assigned-coach visible only, per existing RLS on
-- coaching_meeting_records; never rendered on doctor-facing surfaces.
alter table coaching_meeting_records
  add column if not exists raw_transcript text;
