-- One-time cleanup: reset coach prep for Johno Oberly (Fenton doctor)
-- Keep doctor_baseline_assessments (completed) intact

-- Delete coaching session selections
DELETE FROM coaching_session_selections WHERE session_id = '776eeda7-2a70-4b1d-9c4f-e92f91cbb082';

-- Delete coaching session
DELETE FROM coaching_sessions WHERE id = '776eeda7-2a70-4b1d-9c4f-e92f91cbb082';

-- Delete coach baseline items (if any)
DELETE FROM coach_baseline_items WHERE assessment_id = '006f0946-4f8f-465a-9471-af9fdebfb5c0';

-- Delete coach baseline assessment
DELETE FROM coach_baseline_assessments WHERE id = '006f0946-4f8f-465a-9471-af9fdebfb5c0';