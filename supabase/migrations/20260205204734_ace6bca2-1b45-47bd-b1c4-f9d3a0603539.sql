-- Create Doctor competency for Chart Accuracy
INSERT INTO competencies (competency_id, name, code, domain_id, role_id, status, tagline)
VALUES 
  (401, 'Chart Accuracy', 'DR-CHART', 1, 4, 'active', 'Accurate records protect patients and teams');

-- Create Doctor Pro Moves for Chart Accuracy
INSERT INTO pro_moves (action_id, action_statement, competency_id, role_id, active, status, description)
VALUES 
  (4001, 'I always chart existing findings at new patient exams to ensure an accurate baseline record.', 401, 4, true, 'active', 
   'An accurate baseline prevents confusion, protects against liability, and ensures we are accurately charting any existing treatment or conditions.'),
  (4002, 'I always update the odontogram at every exam appointment to ensure accurate dentition records.', 401, 4, true, 'active',
   'The odontogram is a living document. If it is not updated consistently, future providers, assistants, and AI tools cannot rely on it for accurate treatment planning.'),
  (4003, 'I always verbalize the exam note in its entirety and in the same order so the RDA and AI can accurately hear and document findings.', 401, 4, true, 'active',
   'Consistency ensures nothing is missed, improves documentation accuracy, and allows AI note-taking tools to function reliably. Comprehensive charting allows for comprehensive treatment planning.');