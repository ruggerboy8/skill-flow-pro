-- Rename context → description on organization_pro_moves
-- to match the platform pro_moves.description field semantically.
ALTER TABLE public.organization_pro_moves
  RENAME COLUMN context TO description;
