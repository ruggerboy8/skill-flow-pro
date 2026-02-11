-- Reset Ana's evaluation review state
UPDATE evaluations 
SET acknowledged_at = NULL, 
    focus_selected_at = NULL, 
    learner_note = NULL,
    viewed_at = NULL
WHERE id = '706152be-856e-485c-ae81-56c9d495dd13';

-- Delete her focus selections
DELETE FROM staff_quarter_focus 
WHERE evaluation_id = '706152be-856e-485c-ae81-56c9d495dd13';