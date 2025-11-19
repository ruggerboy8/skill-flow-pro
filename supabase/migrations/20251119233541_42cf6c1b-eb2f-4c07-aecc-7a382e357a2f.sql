-- Step 1: Delete unwanted pro-moves
-- These are either accidentally created (133-148) or orphaned (110-113, 115-118, 125)
DELETE FROM pro_moves 
WHERE action_id > 132 
   OR action_id IN (110, 111, 112, 113, 115, 116, 117, 118, 125);

-- Step 2: Fix the bulk_upsert_pro_moves function to prioritize action_id matching
CREATE OR REPLACE FUNCTION bulk_upsert_pro_moves(pro_moves_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row jsonb;
  result jsonb := '{"created": 0, "updated": 0, "errors": []}'::jsonb;
  role_id_val bigint;
  competency_id_val bigint;
  existing_id bigint;
  action_id_val bigint;
BEGIN
  -- Verify user is super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can bulk upsert pro moves';
  END IF;

  FOR row IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      -- Extract action_id if provided
      action_id_val := NULLIF(row->>'action_id', '')::bigint;
      
      -- Get role_id
      SELECT r.role_id INTO role_id_val
      FROM roles r
      WHERE LOWER(r.role_name) = LOWER(row->>'role_name');
      
      IF role_id_val IS NULL THEN
        result := jsonb_set(result, '{errors}', 
          (result->'errors') || jsonb_build_object('row', row, 'error', 'Role not found: ' || (row->>'role_name'))
        );
        CONTINUE;
      END IF;

      -- Get competency_id
      SELECT c.competency_id INTO competency_id_val
      FROM competencies c
      WHERE c.role_id = role_id_val
        AND LOWER(c.name) = LOWER(row->>'competency_name');
      
      IF competency_id_val IS NULL THEN
        result := jsonb_set(result, '{errors}', 
          (result->'errors') || jsonb_build_object('row', row, 'error', 'Competency not found: ' || (row->>'competency_name'))
        );
        CONTINUE;
      END IF;

      -- PRIORITY MATCHING: First try to match by action_id if provided
      IF action_id_val IS NOT NULL THEN
        SELECT action_id INTO existing_id
        FROM pro_moves
        WHERE action_id = action_id_val;
      ELSE
        -- Fall back to text-based matching only if no action_id provided
        SELECT action_id INTO existing_id
        FROM pro_moves
        WHERE role_id = role_id_val
          AND competency_id = competency_id_val
          AND LOWER(TRIM(action_statement)) = LOWER(TRIM(row->>'text'));
      END IF;

      IF existing_id IS NOT NULL THEN
        -- UPDATE existing record
        UPDATE pro_moves
        SET 
          action_statement = row->>'text',
          description = COALESCE(NULLIF(row->>'description', ''), description),
          resources_url = COALESCE(NULLIF(row->>'resources_url', ''), resources_url),
          intervention_text = COALESCE(NULLIF(row->>'intervention_text', ''), intervention_text),
          active = COALESCE((row->>'active')::boolean, active),
          updated_at = now(),
          updated_by = auth.uid()
        WHERE action_id = existing_id;
        
        result := jsonb_set(result, '{updated}', to_jsonb((result->>'updated')::int + 1));
      ELSE
        -- INSERT new record (only if no action_id was provided)
        IF action_id_val IS NOT NULL THEN
          result := jsonb_set(result, '{errors}', 
            (result->'errors') || jsonb_build_object('row', row, 'error', 'action_id provided but record not found: ' || action_id_val)
          );
          CONTINUE;
        END IF;
        
        INSERT INTO pro_moves (
          role_id,
          competency_id,
          action_statement,
          description,
          resources_url,
          intervention_text,
          active,
          updated_by
        ) VALUES (
          role_id_val,
          competency_id_val,
          row->>'text',
          NULLIF(row->>'description', ''),
          NULLIF(row->>'resources_url', ''),
          NULLIF(row->>'intervention_text', ''),
          COALESCE((row->>'active')::boolean, true),
          auth.uid()
        );
        
        result := jsonb_set(result, '{created}', to_jsonb((result->>'created')::int + 1));
      END IF;

    EXCEPTION WHEN OTHERS THEN
      result := jsonb_set(result, '{errors}', 
        (result->'errors') || jsonb_build_object('row', row, 'error', SQLERRM)
      );
    END;
  END LOOP;

  RETURN result;
END;
$$;