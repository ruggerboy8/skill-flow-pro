
-- Delete Dr. Johno's incomplete baseline assessment so they can restart
DELETE FROM doctor_baseline_items WHERE assessment_id = '06b8f5f4-5b1b-49b4-a1c3-f8667f81e064';
DELETE FROM doctor_baseline_assessments WHERE id = '06b8f5f4-5b1b-49b4-a1c3-f8667f81e064';
