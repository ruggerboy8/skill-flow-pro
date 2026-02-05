-- Phase 1a: Doctor Onboarding Database Foundation

-- 1.1 Add Doctor role
INSERT INTO roles (role_id, role_name) VALUES (4, 'Doctor')
ON CONFLICT (role_id) DO NOTHING;

-- 1.2 Add doctor and clinical director flags to staff table
ALTER TABLE staff 
  ADD COLUMN IF NOT EXISTS is_doctor BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_clinical_director BOOLEAN DEFAULT false;

-- 1.3 Create doctor baseline assessments table
CREATE TABLE IF NOT EXISTS doctor_baseline_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.4 Create doctor baseline items table (individual ProMove ratings)
CREATE TABLE IF NOT EXISTS doctor_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES doctor_baseline_assessments(id) ON DELETE CASCADE NOT NULL,
  action_id BIGINT REFERENCES pro_moves(action_id) ON DELETE CASCADE NOT NULL,
  self_score INTEGER CHECK (self_score BETWEEN 1 AND 4),
  self_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(assessment_id, action_id)
);

-- 1.5 Enable RLS on new tables
ALTER TABLE doctor_baseline_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_baseline_items ENABLE ROW LEVEL SECURITY;

-- 1.6 RLS Policies for doctor_baseline_assessments

-- Doctors can view their own baseline
CREATE POLICY "Doctors view own baseline"
ON doctor_baseline_assessments
FOR SELECT
USING (
  doctor_staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true
  )
);

-- Doctors can insert their own baseline
CREATE POLICY "Doctors insert own baseline"
ON doctor_baseline_assessments
FOR INSERT
WITH CHECK (
  doctor_staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true
  )
);

-- Doctors can update their own baseline
CREATE POLICY "Doctors update own baseline"
ON doctor_baseline_assessments
FOR UPDATE
USING (
  doctor_staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true
  )
);

-- Clinical Directors can view all doctor baselines
CREATE POLICY "Clinical Directors view all baselines"
ON doctor_baseline_assessments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff 
    WHERE user_id = auth.uid() 
    AND (is_clinical_director = true OR is_super_admin = true)
  )
);

-- 1.7 RLS Policies for doctor_baseline_items

-- Doctors can view their own baseline items
CREATE POLICY "Doctors view own baseline items"
ON doctor_baseline_items
FOR SELECT
USING (
  assessment_id IN (
    SELECT id FROM doctor_baseline_assessments 
    WHERE doctor_staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  )
);

-- Doctors can insert their own baseline items
CREATE POLICY "Doctors insert own baseline items"
ON doctor_baseline_items
FOR INSERT
WITH CHECK (
  assessment_id IN (
    SELECT id FROM doctor_baseline_assessments 
    WHERE doctor_staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true
    )
  )
);

-- Doctors can update their own baseline items
CREATE POLICY "Doctors update own baseline items"
ON doctor_baseline_items
FOR UPDATE
USING (
  assessment_id IN (
    SELECT id FROM doctor_baseline_assessments 
    WHERE doctor_staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true
    )
  )
);

-- Clinical Directors can view all baseline items
CREATE POLICY "Clinical Directors view all baseline items"
ON doctor_baseline_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff 
    WHERE user_id = auth.uid() 
    AND (is_clinical_director = true OR is_super_admin = true)
  )
);

-- 1.8 Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_doctor_baseline_items_assessment 
ON doctor_baseline_items(assessment_id);

CREATE INDEX IF NOT EXISTS idx_doctor_baseline_assessments_staff 
ON doctor_baseline_assessments(doctor_staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_is_doctor 
ON staff(is_doctor) WHERE is_doctor = true;

CREATE INDEX IF NOT EXISTS idx_staff_is_clinical_director 
ON staff(is_clinical_director) WHERE is_clinical_director = true;