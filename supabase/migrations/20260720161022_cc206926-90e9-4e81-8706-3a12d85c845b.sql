-- 1) Fix current_user_org_id() to prefer staff.organization_id, falling back to the location join.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    s.organization_id,
    (SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1)
  )
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  ORDER BY s.organization_id NULLS LAST
  LIMIT 1;
$$;

-- 2) Supporting index for the auth.uid() -> org lookup hot path.
CREATE INDEX IF NOT EXISTS idx_staff_user_id_org
  ON public.staff(user_id)
  INCLUDE (organization_id, primary_location_id);

-- 3) Backfill staff.organization_id from location -> group -> org where missing.
UPDATE public.staff s
SET organization_id = pg.organization_id
FROM public.locations l
JOIN public.practice_groups pg ON pg.id = l.group_id
WHERE s.organization_id IS NULL
  AND s.primary_location_id = l.id
  AND pg.organization_id IS NOT NULL;

-- 4) Trigger: auto-fill staff.organization_id from primary_location_id on insert/update
--    whenever the org column is left NULL. Keeps the invariant self-healing.
CREATE OR REPLACE FUNCTION public.staff_fill_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.primary_location_id IS NOT NULL THEN
    SELECT pg.organization_id
      INTO NEW.organization_id
    FROM public.locations l
    JOIN public.practice_groups pg ON pg.id = l.group_id
    WHERE l.id = NEW.primary_location_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_fill_organization_id ON public.staff;
CREATE TRIGGER trg_staff_fill_organization_id
  BEFORE INSERT OR UPDATE OF primary_location_id, organization_id ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_fill_organization_id();