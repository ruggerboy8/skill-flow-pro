UPDATE weekly_scores 
SET performance_score = NULL, 
    performance_date = NULL, 
    performance_late = NULL,
    performance_source = 'live'::score_source
WHERE staff_id = 'c18dec61-0e21-42c7-bfe1-02f1095a9d14' 
AND performance_date::date = CURRENT_DATE
AND performance_score IS NOT NULL;