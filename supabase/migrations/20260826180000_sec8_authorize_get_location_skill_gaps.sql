-- SEC-8: add caller authorization to get_location_skill_gaps.
--
-- The function is SECURITY DEFINER and EXECUTE-granted to `authenticated`, but
-- had NO authorization check on its p_location_id argument. Any logged-in user
-- could pass any location's id, including another tenant's, and read that
-- location's skill-gap data (pro moves, average confidence, staff counts per
-- role). Live cross-org data leak.
--
-- Fix: resolve the location's org (locations.group_id ->
-- practice_groups.organization_id) and require it to match the caller's org
-- (current_user_org_id()), unless the caller is a super admin. This mirrors the
-- guard already in get_location_domain_staff_averages (added by the SEC-2b
-- family), so the whole location-scoped function surface uses one idiom.
--
-- The function was LANGUAGE sql; converting to plpgsql to carry the guard.
-- The query body below is unchanged from the live definition except for being
-- wrapped in RETURN QUERY. Idempotent (CREATE OR REPLACE). No data change.
-- Does NOT need to lag a Lovable deploy: both callers
-- (LocationSkillGaps.tsx, DomainConfidenceHeatmap.tsx) already pass the viewer's
-- own location ids, which resolve to the caller's own org and pass the guard.

CREATE OR REPLACE FUNCTION public.get_location_skill_gaps(
  p_location_id uuid,
  p_lookback_weeks integer DEFAULT 6,
  p_limit_per_role integer DEFAULT 3
)
 RETURNS TABLE(
   action_id bigint,
   action_statement text,
   role_id bigint,
   role_name text,
   domain_name text,
   avg_confidence numeric,
   staff_count bigint
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SEC-8 authorization: a location's org is locations.group_id ->
  -- practice_groups.organization_id. Non-super-admins may only read a location
  -- in their own org. A nonexistent location resolves to NULL org and is
  -- therefore also rejected (does not leak existence).
  IF (
       SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
       WHERE l.id = p_location_id
     ) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff s
       WHERE s.user_id = auth.uid() AND s.is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH staff_totals AS (
    -- Count active participants per role at this location
    SELECT
      s.role_id,
      COUNT(*)::bigint AS total_staff
    FROM staff s
    WHERE s.primary_location_id = p_location_id
      AND s.is_participant = true
    GROUP BY s.role_id
  ),
  location_scores AS (
    SELECT
      ws.site_action_id AS action_id,
      ws.confidence_score,
      s.role_id,
      s.id AS staff_id
    FROM weekly_scores ws
    JOIN staff s ON s.id = ws.staff_id
    WHERE s.primary_location_id = p_location_id
      AND ws.week_of >= CURRENT_DATE - (p_lookback_weeks || ' weeks')::interval
      AND ws.confidence_score IS NOT NULL
      AND ws.site_action_id IS NOT NULL
  ),
  aggregated AS (
    SELECT
      ls.action_id,
      ls.role_id,
      AVG(ls.confidence_score)::numeric(3,2) AS avg_confidence,
      COUNT(DISTINCT ls.staff_id) AS staff_count
    FROM location_scores ls
    GROUP BY ls.action_id, ls.role_id
  ),
  filtered AS (
    -- Apply threshold: 50% of staff for RDA (role_id=2), min 1 for DFI (role_id=1)
    SELECT
      a.action_id,
      a.role_id,
      a.avg_confidence,
      a.staff_count
    FROM aggregated a
    JOIN staff_totals st ON st.role_id = a.role_id
    WHERE
      CASE
        WHEN a.role_id = 2 THEN a.staff_count >= CEIL(st.total_staff * 0.5)
        ELSE a.staff_count >= 1  -- DFI: just need at least 1 rating
      END
  ),
  ranked AS (
    SELECT
      f.action_id,
      f.role_id,
      f.avg_confidence,
      f.staff_count,
      ROW_NUMBER() OVER (PARTITION BY f.role_id ORDER BY f.avg_confidence ASC) AS rn
    FROM filtered f
  )
  SELECT
    r.action_id,
    pm.action_statement,
    r.role_id,
    ro.role_name,
    d.domain_name,
    r.avg_confidence,
    r.staff_count
  FROM ranked r
  JOIN pro_moves pm ON pm.action_id = r.action_id
  JOIN competencies c ON c.competency_id = pm.competency_id
  JOIN domains d ON d.domain_id = c.domain_id
  JOIN roles ro ON ro.role_id = r.role_id
  WHERE r.rn <= p_limit_per_role
  ORDER BY r.role_id, r.avg_confidence ASC;
END;
$function$;

-- Post-apply self-check: fail loudly if the guard did not land.
do $$
declare
  v_lang text;
  v_secdef boolean;
begin
  select l.lanname, p.prosecdef
    into v_lang, v_secdef
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_location_skill_gaps';

  if v_lang <> 'plpgsql' then
    raise exception 'SEC-8 self-check FAILED: function is not plpgsql (guard not installed)';
  end if;
  if v_secdef is distinct from true then
    raise exception 'SEC-8 self-check FAILED: function lost SECURITY DEFINER';
  end if;
  if pg_get_functiondef(
       (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='get_location_skill_gaps')
     ) not like '%RAISE EXCEPTION ''forbidden''%' then
    raise exception 'SEC-8 self-check FAILED: authorization guard text missing';
  end if;

  raise notice 'SEC-8 self-check passed: get_location_skill_gaps now authorizes the caller.';
end $$;
