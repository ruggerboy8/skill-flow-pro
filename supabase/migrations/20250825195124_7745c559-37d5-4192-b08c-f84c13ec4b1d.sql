-- Clear corrupted backlog items for staff member
-- These were incorrectly added from completed weeks
DELETE FROM public.user_backlog_v2 
WHERE staff_id = '0df48cba-1e22-4588-8685-72da2566f2e5'
  AND action_id IN (19, 20, 21, 56);