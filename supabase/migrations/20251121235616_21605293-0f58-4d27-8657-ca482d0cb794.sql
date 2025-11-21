-- Step 1: Create missing weekly_assignments for scores that don't have matching assignments
WITH existing_max_order AS (
  SELECT 
    week_start_date,
    role_id,
    location_id,
    source,
    MAX(display_order) as max_order
  FROM weekly_assignments
  WHERE source = 'onboarding'
  GROUP BY week_start_date, role_id, location_id, source
),
new_assignments AS (
  SELECT DISTINCT
    ws.week_of as week_start_date,
    s.role_id,
    s.primary_location_id as location_id,
    CASE 
      WHEN ws.site_action_id IS NOT NULL THEN ws.site_action_id 
      ELSE NULL 
    END as action_id,
    CASE 
      WHEN ws.site_action_id IS NOT NULL THEN NULL
      ELSE pm_selected.competency_id 
    END as competency_id,
    (ws.site_action_id IS NULL) as self_select,
    COALESCE(emo.max_order, 0) + ROW_NUMBER() OVER (
      PARTITION BY ws.week_of, s.role_id, s.primary_location_id 
      ORDER BY ws.site_action_id NULLS LAST, COALESCE(ws.site_action_id, ws.selected_action_id)
    ) as display_order
  FROM weekly_scores ws
  JOIN staff s ON s.id = ws.staff_id
  LEFT JOIN pro_moves pm_selected ON pm_selected.action_id = ws.selected_action_id
  LEFT JOIN existing_max_order emo ON 
    emo.week_start_date = ws.week_of
    AND emo.role_id = s.role_id
    AND emo.location_id = s.primary_location_id
    AND emo.source = 'onboarding'
  WHERE ws.week_of IS NOT NULL
    AND (ws.site_action_id IS NOT NULL OR ws.selected_action_id IS NOT NULL)
    AND s.role_id IS NOT NULL
    AND s.primary_location_id IS NOT NULL
    -- Ensure we have the required field for each type
    AND (
      (ws.site_action_id IS NOT NULL) -- Non-self-select needs action_id
      OR (ws.site_action_id IS NULL AND pm_selected.competency_id IS NOT NULL) -- Self-select needs competency_id
    )
    -- Only insert if no matching assignment exists
    AND NOT EXISTS (
      SELECT 1 
      FROM weekly_assignments wa
      WHERE wa.week_start_date = ws.week_of
        AND wa.role_id = s.role_id
        AND wa.location_id = s.primary_location_id
        AND (
          (ws.site_action_id IS NOT NULL AND wa.action_id = ws.site_action_id AND wa.self_select = false)
          OR (ws.site_action_id IS NULL AND wa.competency_id = pm_selected.competency_id AND wa.self_select = true)
        )
    )
)
INSERT INTO weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  org_id,
  action_id,
  competency_id,
  self_select,
  display_order,
  source,
  status
)
SELECT 
  week_start_date,
  role_id,
  location_id,
  NULL::uuid as org_id,
  action_id,
  competency_id,
  self_select,
  display_order,
  'onboarding' as source,
  'locked' as status
FROM new_assignments;

-- Step 2: Update all scores to reference the correct week's assignment
UPDATE weekly_scores ws
SET assignment_id = 'assign:' || wa.id::text
FROM weekly_assignments wa,
     staff s
WHERE ws.staff_id = s.id
  AND wa.week_start_date = ws.week_of
  AND wa.role_id = s.role_id
  AND wa.status = 'locked'
  AND (
    -- Match site action (non-self-select)
    (wa.action_id = ws.site_action_id AND wa.self_select = false)
    OR 
    -- Match self-select by checking selected_action is in the competency
    (wa.self_select = true AND ws.site_action_id IS NULL AND EXISTS (
      SELECT 1 FROM pro_moves pm 
      WHERE pm.action_id = ws.selected_action_id 
      AND pm.competency_id = wa.competency_id
    ))
  )
  AND (
    wa.location_id = s.primary_location_id
    OR (wa.location_id IS NULL AND wa.org_id = (SELECT organization_id FROM locations WHERE id = s.primary_location_id))
    OR (wa.location_id IS NULL AND wa.org_id IS NULL)
  )
  -- Only update if currently wrong or null
  AND (ws.assignment_id IS NULL OR ws.assignment_id != 'assign:' || wa.id::text);