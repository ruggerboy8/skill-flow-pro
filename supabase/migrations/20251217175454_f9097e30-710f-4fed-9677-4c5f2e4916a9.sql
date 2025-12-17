-- Add extracted_insights column to evaluations table for storing AI-extracted qualitative insights
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS extracted_insights JSONB;