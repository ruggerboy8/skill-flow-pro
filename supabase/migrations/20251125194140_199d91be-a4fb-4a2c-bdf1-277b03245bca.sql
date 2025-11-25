-- Fix bulk_upsert_pro_moves to properly update description, script, and intervention_text
-- The issue was that NULLIF would convert empty strings to NULL, then COALESCE would keep old values
-- Now: if the field is provided in the JSON (even as empty string), update it. If NULL, keep existing.

CREATE OR REPLACE FUNCTION bulk_upsert_pro_moves(pro_moves_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row jsonb;
  result jsonb := '{"created": 0, "updated": 0, "skipped": 0, "errors": []}'::jsonb;
  role_id_val bigint;
  competency_id_val bigint;
  existing_id bigint;
  action_id_val bigint;
  script_text text;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can bulk upsert pro moves';
  END IF;

  FOR row IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      action_id_val := NULLIF(row->>'action_id', '')::bigint;
      script_text := row->>'script'; -- Don't use NULLIF here, we want to detect if it was provided
      
      SELECT r.role_id INTO role_id_val
      FROM roles r
      WHERE LOWER(r.role_name) = LOWER(row->>'role_name');
      
      IF role_id_val IS NULL THEN
        result := jsonb_set(result, '{errors}', 
          (result->'errors') || jsonb_build_object('row', row, 'error', 'Role not found: ' || (row->>'role_name'))
        );
        CONTINUE;
      END IF;

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

      IF action_id_val IS NOT NULL THEN
        SELECT action_id INTO existing_id
        FROM pro_moves
        WHERE action_id = action_id_val;
      ELSE
        SELECT action_id INTO existing_id
        FROM pro_moves
        WHERE role_id = role_id_val
          AND competency_id = competency_id_val
          AND LOWER(TRIM(action_statement)) = LOWER(TRIM(row->>'text'));
      END IF;

      IF existing_id IS NOT NULL THEN
        -- UPDATE existing pro_move record
        -- If the field is present in the JSON (even as empty string), update it. If NULL, keep existing.
        UPDATE pro_moves
        SET 
          action_statement = row->>'text',
          description = CASE 
            WHEN row ? 'description' THEN row->>'description'
            ELSE description
          END,
          resources_url = CASE 
            WHEN row ? 'resources_url' THEN row->>'resources_url'
            ELSE resources_url
          END,
          intervention_text = CASE 
            WHEN row ? 'intervention_text' THEN row->>'intervention_text'
            ELSE intervention_text
          END,
          active = COALESCE((row->>'active')::boolean, active),
          updated_at = now(),
          updated_by = auth.uid()
        WHERE action_id = existing_id;
        
        -- Handle script update in pro_move_resources
        IF row ? 'script' THEN
          -- Check if script resource exists
          IF EXISTS (
            SELECT 1 FROM pro_move_resources 
            WHERE action_id = existing_id AND type = 'script'
          ) THEN
            IF script_text IS NOT NULL AND script_text != '' THEN
              -- Update existing script with new content
              UPDATE pro_move_resources
              SET content_md = script_text, updated_at = now()
              WHERE action_id = existing_id AND type = 'script';
            ELSE
              -- Empty script provided, delete the script resource
              DELETE FROM pro_move_resources
              WHERE action_id = existing_id AND type = 'script';
            END IF;
          ELSE
            -- Create new script resource only if text is provided
            IF script_text IS NOT NULL AND script_text != '' THEN
              INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status)
              VALUES (existing_id, 'script', script_text, 1, 'active');
            END IF;
          END IF;
        END IF;
        
        result := jsonb_set(result, '{updated}', to_jsonb((result->>'updated')::int + 1));
      ELSE
        -- If action_id provided but not found, skip it (was deleted)
        IF action_id_val IS NOT NULL THEN
          result := jsonb_set(result, '{skipped}', to_jsonb((result->>'skipped')::int + 1));
          CONTINUE;
        END IF;
        
        -- INSERT new pro_move record
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
        ) RETURNING action_id INTO existing_id;
        
        -- Handle script insert in pro_move_resources
        IF script_text IS NOT NULL AND script_text != '' THEN
          INSERT INTO pro_move_resources (action_id, type, content_md, display_order, status)
          VALUES (existing_id, 'script', script_text, 1, 'active');
        END IF;
        
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