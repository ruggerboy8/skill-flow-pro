-- Backfill meeting_link on existing scheduling_invite_sent sessions
UPDATE coaching_sessions 
SET meeting_link = (SELECT scheduling_link FROM staff WHERE id = coaching_sessions.coach_staff_id)
WHERE status = 'scheduling_invite_sent'
AND meeting_link IS NULL;