-- Delete Johno's baseline data so they can start fresh
DELETE FROM doctor_baseline_items WHERE assessment_id = '3cd54f6c-9ec5-4e2d-91b2-04afc5ebd28a';
DELETE FROM doctor_baseline_assessments WHERE id = '3cd54f6c-9ec5-4e2d-91b2-04afc5ebd28a';

-- Also clear any coach baseline for this doctor
DELETE FROM coach_baseline_items WHERE assessment_id IN (
  SELECT id FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc'
);
DELETE FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc';