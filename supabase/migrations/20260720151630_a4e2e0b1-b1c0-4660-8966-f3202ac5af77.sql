
CREATE OR REPLACE FUNCTION public.normalize_doctor_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_doctor IS TRUE AND NEW.name IS NOT NULL THEN
    NEW.name := btrim(regexp_replace(btrim(NEW.name), '^(dr\.?|doctor\.?)\s+', '', 'i'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_normalize_doctor_name ON public.staff;
CREATE TRIGGER staff_normalize_doctor_name
  BEFORE INSERT OR UPDATE OF name, is_doctor ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_doctor_name();

UPDATE public.staff
SET name = btrim(regexp_replace(btrim(name), '^(dr\.?|doctor\.?)\s+', '', 'i'))
WHERE is_doctor = true
  AND name ~* '^(dr\.?|doctor\.?)\s+';
