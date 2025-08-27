-- Add cascade deletes for tables missing them
ALTER TABLE evaluations 
DROP CONSTRAINT IF EXISTS evaluations_staff_id_fkey,
ADD CONSTRAINT evaluations_staff_id_fkey 
FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;

ALTER TABLE staff_audit
DROP CONSTRAINT IF EXISTS staff_audit_staff_id_fkey,
ADD CONSTRAINT staff_audit_staff_id_fkey 
FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;