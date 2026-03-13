INSERT INTO public.organizations (id, name, slug, practice_type)
VALUES ('a1ca0000-0000-0000-0000-000000000001', 'Alcan Pediatric Dental', 'alcan', 'pediatric')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.practice_groups
SET organization_id = 'a1ca0000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

ALTER TABLE public.practice_groups ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS practice_type TEXT NOT NULL DEFAULT 'pediatric'
  CHECK (practice_type IN ('pediatric', 'general', 'all'));

DO $$
DECLARE unlinked_count INT;
BEGIN
  SELECT COUNT(*) INTO unlinked_count FROM public.practice_groups WHERE organization_id IS NULL;
  IF unlinked_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % practice_groups still have NULL organization_id', unlinked_count;
  END IF;
END;
$$;