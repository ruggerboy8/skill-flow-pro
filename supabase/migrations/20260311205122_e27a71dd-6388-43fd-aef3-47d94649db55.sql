-- Update Christine Choi: switch to Office Manager role, set participation start, remove coach flag
UPDATE public.staff
SET role_id = 3,
    participation_start_at = '2026-03-09',
    is_coach = false
WHERE id = '09dbaeea-ad15-4533-8623-093b3ab00146'
  AND name = 'Christine Choi';
