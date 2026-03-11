
-- =============================================================
-- Practice‑type expansion: 3 region‑specific values
-- =============================================================

-- 1. ORGANIZATIONS — rename values & update CHECK
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_practice_type_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS chk_org_practice_type;

UPDATE public.organizations SET practice_type = 'pediatric_us' WHERE practice_type = 'pediatric';
UPDATE public.organizations SET practice_type = 'general_us'   WHERE practice_type = 'general';

ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_practice_type
  CHECK (practice_type IN ('pediatric_us', 'general_us', 'general_uk'));

-- 2. PRO_MOVES — convert practice_type TEXT → practice_types TEXT[]
ALTER TABLE public.pro_moves ADD COLUMN practice_types text[];

UPDATE public.pro_moves SET practice_types = CASE
  WHEN practice_type = 'all'       THEN ARRAY['pediatric_us','general_us','general_uk']
  WHEN practice_type = 'pediatric' THEN ARRAY['pediatric_us']
  WHEN practice_type = 'general'   THEN ARRAY['general_us']
  ELSE ARRAY[practice_type]
END;

ALTER TABLE public.pro_moves ALTER COLUMN practice_types SET NOT NULL;
ALTER TABLE public.pro_moves ALTER COLUMN practice_types SET DEFAULT ARRAY['pediatric_us']::text[];
ALTER TABLE public.pro_moves DROP COLUMN practice_type;

-- 3. ROLES — add practice_type column
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS practice_type text NOT NULL DEFAULT 'pediatric_us';

ALTER TABLE public.roles
  ADD CONSTRAINT chk_role_practice_type
  CHECK (practice_type IN ('pediatric_us', 'general_us', 'general_uk'));
