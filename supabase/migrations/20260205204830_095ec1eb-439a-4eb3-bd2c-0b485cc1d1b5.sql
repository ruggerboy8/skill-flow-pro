-- Drop the old type check constraint and add a new one with doctor-specific types
ALTER TABLE pro_move_resources DROP CONSTRAINT IF EXISTS pro_move_resources_type_check;

ALTER TABLE pro_move_resources 
ADD CONSTRAINT pro_move_resources_type_check 
CHECK (type IN ('link', 'script', 'video', 'audio', 'doctor_text', 'doctor_why', 'doctor_script', 'doctor_gut_check', 'doctor_good_looks_like'));

-- Now insert the learning materials for Doctor Pro Moves

-- Pro Move 4001: Chart existing findings at new patient exams
INSERT INTO pro_move_resources (action_id, type, title, content_md, status, display_order)
VALUES 
  (4001, 'doctor_why', 'Why It Matters', 'An accurate baseline prevents confusion, protects against liability, and ensures we are accurately charting any existing treatment or conditions. It also allows the RDA and AI note-taking systems to capture a complete and accurate starting chart.', 'active', 1),
  (4001, 'doctor_script', 'Scripting', '"Calling out existing stainless steel crown on A, existing occlusal composite on J, missing tooth S."', 'active', 2),
  (4001, 'doctor_good_looks_like', 'What Good Looks Like', E'- Review all radiographs and clinical findings\n- Verbally call out existing restorations, crowns, extractions, missing teeth\n- Ensure these findings are charted before diagnosing new disease', 'active', 3);

-- Pro Move 4002: Update odontogram at every exam
INSERT INTO pro_move_resources (action_id, type, title, content_md, status, display_order)
VALUES 
  (4002, 'doctor_why', 'Why It Matters', 'The odontogram is a living document. If it is not updated consistently, future providers, assistants, and AI tools cannot rely on it for accurate treatment planning.', 'active', 1),
  (4002, 'doctor_script', 'Scripting', E'"Let''s update the odontogram—T has exfoliated since the last visit. #30 has erupted, let''s plan a sealant."', 'active', 2),
  (4002, 'doctor_good_looks_like', 'What Good Looks Like', E'- Confirm erupted, missing, restored, or exfoliated teeth\n- Update changes at every recall and exam', 'active', 3);

-- Pro Move 4003: Verbalize exam note in same order
INSERT INTO pro_move_resources (action_id, type, title, content_md, status, display_order)
VALUES 
  (4003, 'doctor_why', 'Why It Matters', 'Consistency ensures nothing is missed, improves documentation accuracy, and allows AI note-taking tools to function reliably. Comprehensive charting allows for comprehensive treatment planning. If we miss the airway evaluation or BMI we may unintentionally plan a high risk patient for oral sedation or not offer the most comprehensive and safe options available.', 'active', 1),
  (4003, 'doctor_script', 'Scripting', E'"Extraoral - no abnormal findings observed, intraoral soft tissue - apthous ulcer present upper right adjacent to tooth #C, Brosdky 3, Mallampati 3 hard tissue findings include…"', 'active', 2),
  (4003, 'doctor_good_looks_like', 'What Good Looks Like', E'- Use the same exam flow every time\n- Speak findings aloud clearly and completely (so RDA + AI can capture)\n- Include airway evaluation + BMI as part of the consistent sequence', 'active', 3);