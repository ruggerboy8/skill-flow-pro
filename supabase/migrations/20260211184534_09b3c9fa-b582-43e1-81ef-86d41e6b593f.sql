-- Clear Ana Soto Bernal's review data so she can re-test the V2 flow
UPDATE evaluations
SET review_payload = NULL,
    viewed_at = NULL,
    acknowledged_at = NULL,
    focus_selected_at = NULL
WHERE id = '706152be-856e-485c-ae81-56c9d495dd13';

DELETE FROM staff_quarter_focus
WHERE evaluation_id = '706152be-856e-485c-ae81-56c9d495dd13';