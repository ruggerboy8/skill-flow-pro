-- Add allow_backfill_until column to staff table
-- This enables temporary permission for users to backfill missing confidence scores
-- NULL = backfill disabled (default)
-- Future timestamp = backfill enabled until that time

ALTER TABLE public.staff 
ADD COLUMN allow_backfill_until TIMESTAMPTZ DEFAULT NULL;