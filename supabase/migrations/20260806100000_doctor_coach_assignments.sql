-- APPLIED LIVE 2026-08-06 via MCP (migration "doctor_coach_assignments");
-- this file is the idempotent repo record. Full SQL in migration history.
-- Summary: doctor_coach_assignments table (CDs assign learner doctors to
-- "doctor coaches", typically owner doctors); is_assigned_doctor_coach()
-- helper; SELECT policies granting assigned coaches full history (self +
-- observed baselines, sessions, meeting records, selections). Being a doctor
-- coach is derived from having >=1 assignment - no new role flags.
select 1;
