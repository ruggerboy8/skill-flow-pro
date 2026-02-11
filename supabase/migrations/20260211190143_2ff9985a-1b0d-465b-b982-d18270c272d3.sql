
-- Add learner_note column
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS learner_note text;

-- Recreate RPC to accept learner_note
CREATE OR REPLACE FUNCTION public.save_eval_acknowledgement_and_focus(
  p_eval_id uuid,
  p_staff_id uuid,
  p_action_ids integer[],
  p_learner_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update evaluation
  UPDATE evaluations
  SET acknowledged_at = COALESCE(acknowledged_at, now()),
      focus_selected_at = COALESCE(focus_selected_at, now()),
      learner_note = COALESCE(p_learner_note, evaluations.learner_note)
  WHERE id = p_eval_id;

  -- Delete existing focus rows for this eval
  DELETE FROM staff_quarter_focus
  WHERE evaluation_id = p_eval_id AND staff_id = p_staff_id;

  -- Insert new focus rows
  INSERT INTO staff_quarter_focus (evaluation_id, staff_id, action_id)
  SELECT p_eval_id, p_staff_id, unnest(p_action_ids);
END;
$$;
