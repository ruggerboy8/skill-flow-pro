-- Delete coach baseline items for Johno Oberly's assessment
DELETE FROM coach_baseline_items WHERE assessment_id = '46f254a2-90c1-4934-a497-4f7edcc679a4';

-- Delete the coach baseline assessment itself
DELETE FROM coach_baseline_assessments WHERE id = '46f254a2-90c1-4934-a497-4f7edcc679a4';