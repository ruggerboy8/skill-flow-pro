-- Create a placeholder pro move for Clinical Team Communication if it doesn't exist
-- First check if we have this competency
DO $$
DECLARE
    clinical_team_competency_id bigint;
    new_action_id bigint;
BEGIN
    -- Get the Clinical Team Communication competency
    SELECT competency_id INTO clinical_team_competency_id 
    FROM competencies 
    WHERE name = 'Clinical Team Communication' 
    LIMIT 1;
    
    IF clinical_team_competency_id IS NOT NULL THEN
        -- Check if we need a new pro move for this competency
        IF NOT EXISTS (
            SELECT 1 FROM pro_moves 
            WHERE competency_id = clinical_team_competency_id
        ) THEN
            -- Get next action_id
            SELECT COALESCE(MAX(action_id), 0) + 1 INTO new_action_id FROM pro_moves;
            
            -- Insert a placeholder pro move
            INSERT INTO pro_moves (action_id, competency_id, action_statement, status)
            VALUES (
                new_action_id,
                clinical_team_competency_id,
                'I always communicate clearly with team members during patient care procedures.',
                'active'
            );
            
            -- Update the weekly_focus entry to use this new pro move
            UPDATE weekly_focus 
            SET action_id = new_action_id,
                competency_id = clinical_team_competency_id
            WHERE role_id = 2 
              AND cycle = 1 
              AND week_in_cycle = 1 
              AND display_order = 2
              AND action_id IS NULL;
        ELSE
            -- Use existing pro move
            UPDATE weekly_focus 
            SET action_id = (
                SELECT action_id FROM pro_moves 
                WHERE competency_id = clinical_team_competency_id 
                LIMIT 1
            ),
            competency_id = clinical_team_competency_id
            WHERE role_id = 2 
              AND cycle = 1 
              AND week_in_cycle = 1 
              AND display_order = 2
              AND action_id IS NULL;
        END IF;
    END IF;
END $$;