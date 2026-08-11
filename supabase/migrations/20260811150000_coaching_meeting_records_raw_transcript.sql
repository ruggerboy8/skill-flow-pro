-- Persist the pasted meeting transcript when a coach uses AI Transcript
-- Assist in outcome capture. Previously it was fed to the summarizer and
-- discarded (verified live 2026-08-11: 0 transcripts existed anywhere).
-- John: persist everywhere, all orgs — low enough usage that the exposure
-- risk is small. NOTE: RLS does NOT hide this column from the doctor
-- ("Doctor can view meeting records" grants row-level SELECT, and Postgres
-- RLS has no column granularity) — it is their own conversation, so that
-- is acceptable. The UI keeps it coach-side by never selecting or
-- rendering it on doctor-facing surfaces (doctor queries use explicit
-- column lists, not select *).
alter table coaching_meeting_records
  add column if not exists raw_transcript text;
