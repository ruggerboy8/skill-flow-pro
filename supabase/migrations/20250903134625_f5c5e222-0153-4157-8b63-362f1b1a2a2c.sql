-- Insert backfill scores for Jazmin Torres (Cycle 1, Weeks 2 and 3)
INSERT INTO public.weekly_scores (
  staff_id, 
  weekly_focus_id, 
  confidence_score, 
  performance_score,
  confidence_source,
  performance_source,
  confidence_late,
  performance_late
) VALUES 
-- Week 2 scores
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', 'cf6f6fa6-05d3-42c7-a2a6-f993fd7e8ff7', 4, 4, 'backfill', 'backfill', false, false),
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', '197fa3ba-16a6-4c74-940e-97d37b39f6b4', 3, 2, 'backfill', 'backfill', false, false),
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', 'a0d4d617-6ae8-4fbf-a964-a79a372cb294', 3, 3, 'backfill', 'backfill', false, false),
-- Week 3 scores  
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', '7c572657-b9b2-490f-9a7c-553a5b112864', 4, 4, 'backfill', 'backfill', false, false),
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', 'ca8b6ba9-1833-4e17-868f-ba7ab56a3fb0', 2, 2, 'backfill', 'backfill', false, false),
('13b3c4eb-cd13-415d-ac28-f401aaaff0db', '0c7f02b6-6a81-447f-a976-2a7fc91d8eec', 3, 3, 'backfill', 'backfill', false, false);