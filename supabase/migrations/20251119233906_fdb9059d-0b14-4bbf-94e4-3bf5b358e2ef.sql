-- Fix bulk_upsert to skip missing action_ids instead of erroring
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
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can bulk upsert pro moves';
  END IF;

  FOR row IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      action_id_val := NULLIF(row->>'action_id', '')::bigint;
      
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
        -- If action_id provided but not found, skip it (was deleted)
        IF action_id_val IS NOT NULL THEN
          result := jsonb_set(result, '{skipped}', to_jsonb((result->>'skipped')::int + 1));
          CONTINUE;
        END IF;
        
        -- INSERT new record only if no action_id was provided
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