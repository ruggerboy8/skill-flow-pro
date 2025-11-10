-- =====================================================
-- Learning Resources Database Foundation
-- =====================================================

-- 1) TABLES & INDEXES
-- =====================================================

-- Core resources (reusable across Pro-Moves)
CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('video','script','link')),
  url TEXT,
  body_md TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role_id BIGINT REFERENCES roles(role_id) ON DELETE CASCADE,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many between Pro-Moves and resources with ordering
CREATE TABLE IF NOT EXISTS pro_move_resources (
  action_id BIGINT NOT NULL REFERENCES pro_moves(action_id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (action_id, resource_id)
);

-- Usage events (simple, append-only)
CREATE TABLE IF NOT EXISTS resource_events (
  id BIGSERIAL PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  action_id BIGINT NOT NULL,
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('open','video_25','video_50','video_90','script_read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pmr_action ON pro_move_resources(action_id);
CREATE INDEX IF NOT EXISTS idx_lr_status ON learning_resources(status);
CREATE INDEX IF NOT EXISTS idx_lr_role_org ON learning_resources(role_id, org_id);
CREATE INDEX IF NOT EXISTS idx_resource_events_rollups ON resource_events(action_id, resource_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_resource_events_staff ON resource_events(staff_id, created_at);

-- 2) TRIGGERS
-- =====================================================

-- Updated-at trigger for learning_resources
CREATE OR REPLACE FUNCTION set_updated_at() 
RETURNS TRIGGER
LANGUAGE plpgsql 
AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END;
$$;

DROP TRIGGER IF EXISTS trg_lr_updated ON learning_resources;
CREATE TRIGGER trg_lr_updated 
  BEFORE UPDATE ON learning_resources
  FOR EACH ROW 
  EXECUTE FUNCTION set_updated_at();

-- 3) RPCs (BATCH FETCH & USAGE SUMMARY)
-- =====================================================

-- Batch fetch resources for many action_ids with role/org filtering
CREATE OR REPLACE FUNCTION get_resources_for_actions(
  p_action_ids BIGINT[],
  p_role_id INT,
  p_org_id UUID
)
RETURNS TABLE (
  action_id BIGINT,
  resource_id UUID,
  title TEXT,
  type TEXT,
  url TEXT,
  body_md TEXT,
  is_primary BOOLEAN,
  sort_order INT
) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pmr.action_id,
    lr.id,
    lr.title,
    lr.type,
    lr.url,
    lr.body_md,
    lr.is_primary,
    pmr.sort_order
  FROM pro_move_resources pmr
  JOIN learning_resources lr ON lr.id = pmr.resource_id
  WHERE pmr.action_id = ANY(p_action_ids)
    AND lr.status = 'published'
    AND (lr.role_id IS NULL OR lr.role_id = p_role_id)
    AND (lr.org_id IS NULL OR lr.org_id = p_org_id)
  ORDER BY pmr.action_id, lr.is_primary DESC, pmr.sort_order, lr.title;
$$;

-- Per-Pro-Move usage rollup (last 30d + lifetime + 90% video completions)
CREATE OR REPLACE FUNCTION get_resource_usage_summary(p_action_id BIGINT)
RETURNS TABLE (
  resource_id UUID,
  title TEXT,
  type TEXT,
  last_30d_opens INT,
  lifetime_opens INT,
  video_90_completions INT
) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT lr.id, lr.title, lr.type
    FROM pro_move_resources pmr
    JOIN learning_resources lr ON lr.id = pmr.resource_id
    WHERE pmr.action_id = p_action_id
  ),
  roll AS (
    SELECT
      resource_id,
      COUNT(*) FILTER (WHERE event_type='open' AND created_at >= now() - INTERVAL '30 days') AS last_30d_opens,
      COUNT(*) FILTER (WHERE event_type='open') AS lifetime_opens,
      COUNT(*) FILTER (WHERE event_type='video_90') AS video_90_completions
    FROM resource_events
    WHERE action_id = p_action_id
    GROUP BY resource_id
  )
  SELECT 
    b.id, 
    b.title, 
    b.type,
    COALESCE(r.last_30d_opens, 0)::INT,
    COALESCE(r.lifetime_opens, 0)::INT,
    COALESCE(r.video_90_completions, 0)::INT
  FROM base b
  LEFT JOIN roll r ON r.resource_id = b.id;
$$;

-- 4) RLS POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_move_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_events ENABLE ROW LEVEL SECURITY;

-- learning_resources: anyone can read published, admins can manage all
CREATE POLICY lr_select_published ON learning_resources
  FOR SELECT 
  USING (status = 'published' OR is_super_admin(auth.uid()));

CREATE POLICY lr_admin_write ON learning_resources
  FOR ALL 
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- pro_move_resources: everyone can see attachments, admins modify
CREATE POLICY pmr_select_all ON pro_move_resources
  FOR SELECT 
  USING (true);

CREATE POLICY pmr_admin_write ON pro_move_resources
  FOR ALL 
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- resource_events: users insert their own, admins read all
CREATE POLICY re_insert_self ON resource_events
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = resource_events.staff_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY re_admin_select ON resource_events
  FOR SELECT 
  USING (is_super_admin(auth.uid()));

-- 5) STORAGE BUCKET
-- =====================================================

-- Create learning-videos bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learning-videos',
  'learning-videos',
  true,
  104857600, -- 100MB limit
  ARRAY['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, admin write
CREATE POLICY "Public can view learning videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'learning-videos');

CREATE POLICY "Admins can upload learning videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'learning-videos' 
    AND is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can update learning videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'learning-videos' 
    AND is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can delete learning videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'learning-videos' 
    AND is_super_admin(auth.uid())
  );

-- 6) LEGACY MIGRATION (resources_url → link resources)
-- =====================================================

-- Convert existing pro_moves.resources_url to proper link resources
WITH src AS (
  SELECT action_id, resources_url
  FROM pro_moves
  WHERE resources_url IS NOT NULL 
    AND LENGTH(TRIM(resources_url)) > 0
),
ins AS (
  INSERT INTO learning_resources (title, type, url, is_primary, status)
  SELECT 
    'Resource for ' || pm.action_statement,
    'link',
    src.resources_url,
    false,
    'published'
  FROM src
  JOIN pro_moves pm ON pm.action_id = src.action_id
  ON CONFLICT DO NOTHING
  RETURNING id, url
)
INSERT INTO pro_move_resources (action_id, resource_id, sort_order)
SELECT src.action_id, lr.id, 99
FROM src
JOIN learning_resources lr ON lr.type = 'link' AND lr.url = src.resources_url
ON CONFLICT DO NOTHING;