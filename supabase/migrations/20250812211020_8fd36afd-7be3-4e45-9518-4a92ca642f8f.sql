
-- Backfill missing submission timestamps for user "John Oberly" only.
-- This is safe and idempotent: it fills NULL dates using updated_at/created_at.

-- 1) Confidence: fill missing confidence_date where confidence_score exists
update public.weekly_scores ws
set confidence_date = coalesce(ws.confidence_date, ws.updated_at, ws.created_at)
where ws.staff_id = '59710983-af99-4d26-bc5d-fc7ea915d9f0'
  and ws.confidence_score is not null
  and ws.confidence_date is null;

-- 2) Performance: fill missing performance_date where performance_score exists
update public.weekly_scores ws
set performance_date = coalesce(ws.performance_date, ws.updated_at, ws.created_at)
where ws.staff_id = '59710983-af99-4d26-bc5d-fc7ea915d9f0'
  and ws.performance_score is not null
  and ws.performance_date is null;

-- Optional verification queries:
-- View any rows that still have missing dates after the backfill (should be none if scores exist)
-- select id, weekly_focus_id, confidence_score, confidence_date
-- from public.weekly_scores
-- where staff_id = '59710983-af99-4d26-bc5d-fc7ea915d9f0'
--   and confidence_score is not null
--   and confidence_date is null;

-- select id, weekly_focus_id, performance_score, performance_date
-- from public.weekly_scores
-- where staff_id = '59710983-af99-4d26-bc5d-fc7ea915d9f0'
--   and performance_score is not null
--   and performance_date is null;
