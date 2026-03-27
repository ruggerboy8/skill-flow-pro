-- Recalculate curriculum_priority using weighted formula: 60% best(rev,px) + 30% other(rev,px) + 10% foundational
UPDATE pro_moves
SET curriculum_priority = ROUND(
  (0.60 * GREATEST(curriculum_priority_revenue, curriculum_priority_patient_exp)
   + 0.30 * LEAST(curriculum_priority_revenue, curriculum_priority_patient_exp)
   + 0.10 * curriculum_priority_foundational)::numeric, 2
)
WHERE curriculum_priority_generated_at IS NOT NULL;