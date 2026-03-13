
-- Step 1: Delete the duplicate session (seq 1 by wrong coach, no child data)
DELETE FROM coaching_sessions WHERE id = '549ddaec-d5fc-417d-b33a-00fdd2c86b44';

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE coaching_sessions
ADD CONSTRAINT uq_coaching_session_doctor_sequence UNIQUE (doctor_staff_id, sequence_number);
