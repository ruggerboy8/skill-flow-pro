-- Drop the existing policy and create updated one allowing 'active' status
DROP POLICY IF EXISTS pmr_learner_read ON pro_move_resources;

CREATE POLICY pmr_learner_read ON pro_move_resources
  FOR SELECT TO authenticated
  USING (status = 'active' OR status = 'published');