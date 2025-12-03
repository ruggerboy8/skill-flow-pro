-- Temporarily add policy to allow service role updates
CREATE POLICY "Service role can update backfill scores" ON weekly_scores
FOR UPDATE
USING (confidence_source = 'backfill_historical')
WITH CHECK (confidence_source = 'backfill_historical');

-- Also add delete policy for cleanup
CREATE POLICY "Service role can delete backfill scores" ON weekly_scores
FOR DELETE
USING (confidence_source = 'backfill_historical');