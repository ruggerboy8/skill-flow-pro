DELETE FROM public.excused_submissions
WHERE week_of = '2026-04-20'
  AND metric = 'performance'
  AND reason = 'Did not work Thu–Fri per Deputy attendance';