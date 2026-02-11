
-- Delete doctor baseline items first (FK dependency)
DELETE FROM doctor_baseline_items WHERE assessment_id = '58a33268-ed86-467b-ae4f-16f08e29527c';

-- Delete doctor baseline assessment
DELETE FROM doctor_baseline_assessments WHERE id = '58a33268-ed86-467b-ae4f-16f08e29527c';

-- Delete coach baseline items for this doctor
DELETE FROM coach_baseline_items WHERE assessment_id IN (
  SELECT id FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc'
);

-- Delete coach baseline assessments for this doctor
DELETE FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc';
