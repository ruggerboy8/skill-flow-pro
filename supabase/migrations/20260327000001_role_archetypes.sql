-- Add archetype_code column to roles table
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS archetype_code TEXT;

-- Backfill existing roles
UPDATE public.roles SET archetype_code = 'front_desk'          WHERE role_code IN ('front_desk_p_us', 'front_desk_gen_uk');
UPDATE public.roles SET archetype_code = 'dental_assistant'     WHERE role_code IN ('assistant_p_us', 'assistant_gen_uk');
UPDATE public.roles SET archetype_code = 'practice_manager'     WHERE role_code IN ('manager_p_us', 'manager_gen_uk');
UPDATE public.roles SET archetype_code = 'doctor'               WHERE role_code IN ('doctor_p_us', 'doctor_gen_uk');
UPDATE public.roles SET archetype_code = 'treatment_coordinator' WHERE role_id = 10;

-- Lead Dental Assistant for both practice types
INSERT INTO public.roles (role_name, role_code, archetype_code, practice_type, active) VALUES
  ('Lead Dental Assistant', 'lead_da_p_us',  'lead_dental_assistant', 'pediatric_us', true),
  ('Lead Dental Assistant', 'lead_da_gen_uk', 'lead_dental_assistant', 'general_uk',   true)
ON CONFLICT (role_code) DO NOTHING;

-- Hygienist for both practice types
INSERT INTO public.roles (role_name, role_code, archetype_code, practice_type, active) VALUES
  ('Hygienist', 'hygienist_p_us',   'hygienist', 'pediatric_us', true),
  ('Hygienist', 'hygienist_gen_uk',  'hygienist', 'general_uk',   true)
ON CONFLICT (role_code) DO NOTHING;

-- Treatment Coordinator for pediatric_us (already exists for general_uk as role_id=10)
INSERT INTO public.roles (role_name, role_code, archetype_code, practice_type, active) VALUES
  ('Treatment Coordinator', 'tco_p_us', 'treatment_coordinator', 'pediatric_us', true)
ON CONFLICT (role_code) DO NOTHING;

-- Add unique constraint on role_code so ON CONFLICT works properly
-- (only add if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'roles' AND constraint_name = 'roles_role_code_key'
  ) THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_role_code_key UNIQUE (role_code);
  END IF;
END $$;

-- Sanity check
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM public.roles WHERE archetype_code IS NULL AND active = true;
  IF missing_count > 0 THEN
    RAISE WARNING 'Warning: % active role(s) have no archetype_code set', missing_count;
  END IF;
END $$;
