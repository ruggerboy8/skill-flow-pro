-- Backfill domain_id and domain_name for existing evaluation_items
UPDATE evaluation_items ei
SET 
  domain_id = c.domain_id,
  domain_name = d.domain_name
FROM competencies c
JOIN domains d ON d.domain_id = c.domain_id
WHERE ei.competency_id = c.competency_id
  AND ei.domain_id IS NULL;