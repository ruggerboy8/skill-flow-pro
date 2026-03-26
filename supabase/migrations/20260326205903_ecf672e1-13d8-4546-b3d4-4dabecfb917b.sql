
-- Fix: Update bulk_upsert_pro_moves to accept role_id directly per row
-- This avoids the duplicate role_name resolution bug
CREATE OR REPLACE FUNCTION public.bulk_upsert_pro_moves(pro_moves_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  practice_types_val text[];
  practice_types_raw text;
BEGIN
  IF NOT public.is_coach_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Coach or admin required.';
  END IF;

  FOR row_data IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      -- Prefer role_id if provided directly, otherwise fall back to role_name lookup
      IF (row_data->>'role_id') IS NOT NULL THEN
        role_id_val := (row_data->>'role_id')::bigint;
      ELSE
        SELECT r.role_id INTO role_id_val
        FROM public.roles r
        WHERE lower(r.role_name) = lower(row_data->>'role_name')
        LIMIT 1;
      END IF;

      IF role_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data, 'error', 'Role not found'
        );
        CONTINUE;
      END IF;

      SELECT c.competency_id INTO competency_id_val
      FROM public.competencies c
      WHERE lower(c.name) = lower(row_data->>'competency_name')
        AND c.role_id = role_id_val;

      IF competency_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data, 'error', 'Competency not found: ' || (row_data->>'competency_name')
        );
        CONTINUE;
      END IF;

      action_id_text := nullif(row_data->>'action_id', '');
      steps_text := COALESCE(nullif(row_data->>'steps', ''), nullif(row_data->>'script', ''));

      practice_types_raw := nullif(trim(row_data->>'practice_types'), '');
      IF practice_types_raw IS NOT NULL THEN
        practice_types_val := string_to_array(practice_types_raw, '|');
      ELSE
        practice_types_val := NULL;
      END IF;

      IF action_id_text IS NOT NULL THEN
        SELECT pm.action_id INTO existing_id
        FROM public.pro_moves pm
        WHERE pm.action_id = action_id_text::bigint;
      ELSE
        existing_id := NULL;
      END IF;

      IF existing_id IS NOT NULL THEN
        UPDATE public.pro_moves
        SET
          action_statement = COALESCE(nullif(row_data->>'action_statement', ''), action_statement),
          description = COALESCE(nullif(row_data->>'description', ''), description),
          steps = COALESCE(steps_text, steps),
          intervention_text = COALESCE(nullif(row_data->>'intervention_text', ''), intervention_text),
          resources_url = COALESCE(nullif(row_data->>'resources_url', ''), resources_url),
          status = COALESCE(nullif(row_data->>'status', ''), status),
          active = COALESCE((row_data->>'active')::boolean, active),
          practice_types = COALESCE(practice_types_val, practice_types),
          updated_at = now(),
          updated_by = auth.uid()
        WHERE action_id = existing_id;
        updated_count := updated_count + 1;
      ELSE
        INSERT INTO public.pro_moves (
          role_id, competency_id, action_statement, description, steps,
          intervention_text, resources_url, status, active, practice_types,
          date_added, updated_at, updated_by
        ) VALUES (
          role_id_val, competency_id_val,
          nullif(row_data->>'action_statement', ''),
          nullif(row_data->>'description', ''),
          steps_text,
          nullif(row_data->>'intervention_text', ''),
          nullif(row_data->>'resources_url', ''),
          COALESCE(nullif(row_data->>'status', ''), 'active'),
          COALESCE((row_data->>'active')::boolean, true),
          COALESCE(practice_types_val, '{pediatric_us}'::text[]),
          now(), now(), auth.uid()
        );
        created_count := created_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      error_rows := error_rows || jsonb_build_object(
        'row', row_data, 'error', SQLERRM
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
$$;

-- Fix misassigned pro moves: move from role_id 1 to role_id 6
-- These were inserted today with general_uk practice_type but wrong role
UPDATE public.pro_moves
SET role_id = 6
WHERE role_id = 1
  AND practice_types = ARRAY['general_uk']
  AND date_added::date = '2026-03-26';
