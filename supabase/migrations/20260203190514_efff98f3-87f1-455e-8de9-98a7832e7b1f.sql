CREATE OR REPLACE FUNCTION public.bulk_upsert_pro_moves(pro_moves_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  created_count integer := 0;
  updated_count integer := 0;
  error_rows jsonb := '[]'::jsonb;
  row_data jsonb;
  role_id_val bigint;
  competency_id_val bigint;
  existing_id bigint;
  action_id_text text;
  steps_text text;
BEGIN
  -- Check if user is coach or admin
  IF NOT public.is_coach_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Coach or admin required.';
  END IF;

  FOR row_data IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      -- Look up role_id from role_name
      SELECT r.role_id INTO role_id_val
      FROM public.roles r
      WHERE lower(r.role_name) = lower(row_data->>'role_name');

      IF role_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data,
          'error', 'Role not found: ' || (row_data->>'role_name')
        );
        CONTINUE;
      END IF;

      -- Look up competency_id from competency_name
      SELECT c.competency_id INTO competency_id_val
      FROM public.competencies c
      WHERE lower(c.name) = lower(row_data->>'competency_name')
        AND c.role_id = role_id_val;

      IF competency_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data,
          'error', 'Competency not found: ' || (row_data->>'competency_name')
        );
        CONTINUE;
      END IF;

      action_id_text := nullif(row_data->>'action_id', '');
      steps_text := COALESCE(nullif(row_data->>'steps', ''), nullif(row_data->>'script', ''));

      -- Check if pro_move exists (by action_id if provided)
      IF action_id_text IS NOT NULL THEN
        SELECT pm.action_id INTO existing_id
        FROM public.pro_moves pm
        WHERE pm.action_id = action_id_text::bigint;
      ELSE
        existing_id := NULL;
      END IF;

      IF existing_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.pro_moves
        SET
          action_statement = COALESCE(nullif(row_data->>'action_statement', ''), action_statement),
          description = COALESCE(nullif(row_data->>'description', ''), description),
          steps = COALESCE(steps_text, steps),
          intervention_text = COALESCE(nullif(row_data->>'intervention_text', ''), intervention_text),
          resources_url = COALESCE(nullif(row_data->>'resources_url', ''), resources_url),
          status = COALESCE(nullif(row_data->>'status', ''), status),
          active = COALESCE((row_data->>'active')::boolean, active),
          updated_at = now(),
          updated_by = auth.uid()
        WHERE action_id = existing_id;
        updated_count := updated_count + 1;
      ELSE
        -- Insert new
        INSERT INTO public.pro_moves (
          role_id,
          competency_id,
          action_statement,
          description,
          steps,
          intervention_text,
          resources_url,
          status,
          active,
          date_added,
          updated_at,
          updated_by
        ) VALUES (
          role_id_val,
          competency_id_val,
          nullif(row_data->>'action_statement', ''),
          nullif(row_data->>'description', ''),
          steps_text,
          nullif(row_data->>'intervention_text', ''),
          nullif(row_data->>'resources_url', ''),
          COALESCE(nullif(row_data->>'status', ''), 'active'),
          COALESCE((row_data->>'active')::boolean, true),
          now(),
          now(),
          auth.uid()
        );
        created_count := created_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      error_rows := error_rows || jsonb_build_object(
        'row', row_data,
        'error', SQLERRM
      );
    END;
  END LOOP;

  result := jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'errors', error_rows
  );

  RETURN result;
END;
$function$;