-- Run backfill_historical_score_timestamps for all current staff
DO $$
DECLARE
    staff_record RECORD;
    updated_count INTEGER;
BEGIN
    FOR staff_record IN 
        SELECT id, name FROM staff WHERE id IS NOT NULL
    LOOP
        -- Call the backfill function for each staff member
        SELECT backfill_historical_score_timestamps(
            staff_record.id, 
            true, -- p_only_backfill = true (only update backfill records)
            30    -- p_jitter_minutes = 30
        ) INTO updated_count;
        
        RAISE NOTICE 'Updated % timestamps for staff % (%)', updated_count, staff_record.name, staff_record.id;
    END LOOP;
END $$;