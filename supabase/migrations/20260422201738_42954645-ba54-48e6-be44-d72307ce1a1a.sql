-- Allow deputy_employee_id to be NULL (placeholder for "no Deputy match yet")
ALTER TABLE public.deputy_employee_mappings
  ALTER COLUMN deputy_employee_id DROP NOT NULL;

-- Drop the old all-rows unique constraint on (org, deputy_employee_id);
-- a NULL placeholder row would violate it for participants without a match.
ALTER TABLE public.deputy_employee_mappings
  DROP CONSTRAINT IF EXISTS deputy_employee_mappings_organization_id_deputy_employee_id_key;

-- One mapping row per (organization, participant). Participant-first model:
-- we never want two rows for the same SFP staff member in the same org.
CREATE UNIQUE INDEX IF NOT EXISTS deputy_mappings_unique_org_staff
  ON public.deputy_employee_mappings (organization_id, staff_id)
  WHERE staff_id IS NOT NULL;

-- A given Deputy employee can only be linked to at most one SFP participant
-- per org. Partial index lets multiple unmapped (NULL) rows coexist.
CREATE UNIQUE INDEX IF NOT EXISTS deputy_mappings_unique_org_deputy_emp
  ON public.deputy_employee_mappings (organization_id, deputy_employee_id)
  WHERE deputy_employee_id IS NOT NULL;