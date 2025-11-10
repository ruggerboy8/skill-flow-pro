-- Phase 1: Preserve legacy tables
ALTER TABLE pro_move_resources RENAME TO pro_move_resources_legacy;
ALTER TABLE learning_resources RENAME TO learning_resources_legacy;

-- Phase 2: Create new canonical pro_move_resources table (direct attachment)
CREATE TABLE pro_move_resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     BIGINT NOT NULL REFERENCES pro_moves(action_id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('video','script','link')),
  provider      TEXT CHECK (provider IN ('youtube')),
  url           TEXT,
  content_md    TEXT,
  title         TEXT,
  display_order INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pmr_action_id_idx ON pro_move_resources (action_id);
CREATE INDEX pmr_action_type_idx ON pro_move_resources (action_id, type);

-- Phase 3: Migrate data from legacy schema
INSERT INTO pro_move_resources (
  action_id, type, provider, url, content_md, title, display_order, status
)
SELECT
  l_pmr.action_id,
  CASE lr.type
    WHEN 'video'  THEN 'video'
    WHEN 'script' THEN 'script'
    ELSE 'link'
  END AS type,
  CASE
    WHEN lr.type = 'video' AND lr.url ~* '(youtube\.com|youtu\.be)' THEN 'youtube'
  END AS provider,
  lr.url,
  lr.body_md,
  lr.title,
  COALESCE(l_pmr.sort_order, CASE WHEN lr.is_primary THEN 0 ELSE 100 END),
  COALESCE(lr.status, 'published')
FROM pro_move_resources_legacy l_pmr
JOIN learning_resources_legacy lr ON lr.id = l_pmr.resource_id;

-- Phase 4: Update RLS policies
ALTER TABLE pro_move_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmr_admin_all ON pro_move_resources
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY pmr_learner_read ON pro_move_resources
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Phase 5: Add updated_at trigger
CREATE TRIGGER set_updated_at_pmr 
  BEFORE UPDATE ON pro_move_resources
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_pro_moves_timestamp();

-- Phase 6: Create helper functions
CREATE OR REPLACE FUNCTION get_materials_count(p_action_ids BIGINT[])
RETURNS TABLE (action_id BIGINT, material_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT action_id, COUNT(*)::bigint
  FROM pro_move_resources
  WHERE action_id = ANY(p_action_ids)
  GROUP BY action_id;
$$;

CREATE OR REPLACE FUNCTION get_pro_move_resources(p_action_id BIGINT)
RETURNS TABLE (
  id UUID,
  type TEXT,
  provider TEXT,
  url TEXT,
  content_md TEXT,
  title TEXT,
  display_order INT,
  status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, type, provider, url, content_md, title, display_order, status
  FROM pro_move_resources
  WHERE action_id = p_action_id
  ORDER BY display_order, created_at;
$$;