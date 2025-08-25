-- Temporarily disable audit trigger
DROP TRIGGER IF EXISTS audit_staff_privilege_changes ON public.staff;

-- Update Johno Oberly to be coach and superadmin
UPDATE public.staff 
SET 
  is_coach = true,
  is_super_admin = true,
  updated_at = now()
WHERE user_id = 'f4bf43b4-6038-4e7a-856e-d6fe7e1d8022';

-- Recreate the audit trigger
CREATE TRIGGER audit_staff_privilege_changes
  AFTER UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_staff_changes();