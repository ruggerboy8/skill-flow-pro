-- Clear Vivian's recent confidence scores
UPDATE weekly_scores 
SET confidence_score = NULL, 
    confidence_date = NULL, 
    confidence_late = NULL
WHERE staff_id = '7ad14147-e4bc-4e74-8e48-4e60e6c4bc1f'
AND updated_at >= '2025-11-06';