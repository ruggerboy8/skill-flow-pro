
-- Reassign Q1 2026 evaluation from Ariyana McDonald to Ayriana Crayton
UPDATE evaluations
SET staff_id = '3332a58f-6fd1-40dd-b4f0-f27fea218c25'  -- Ayriana Crayton
WHERE id = '5d085843-c03e-4878-a610-15dddfe94903'      -- The Q1 2026 eval
  AND staff_id = '38d4458c-cc01-402a-bf59-d7530f39c0ec'; -- Currently assigned to Ariyana McDonald
