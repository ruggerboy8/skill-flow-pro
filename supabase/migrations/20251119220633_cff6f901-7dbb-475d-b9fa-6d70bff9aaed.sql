-- Add intervention_text column to pro_moves
ALTER TABLE public.pro_moves 
ADD COLUMN intervention_text text;

-- Update bulk_upsert_pro_moves function to handle intervention_text
CREATE OR REPLACE FUNCTION public.bulk_upsert_pro_moves(pro_moves_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  -- Check if user is super admin
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin required.';
  END IF;

  -- Process each row
  FOR row_data IN SELECT * FROM jsonb_array_elements(pro_moves_data)
  LOOP
    BEGIN
      -- Get role_id from role_name
      SELECT r.role_id INTO role_id_val
      FROM public.roles r
      WHERE LOWER(r.role_name) = LOWER(row_data->>'role_name');
      
      IF role_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data,
          'error', 'Role not found: ' || (row_data->>'role_name')
        );
        CONTINUE;
      END IF;

      -- Get competency_id from competency_name AND role_id
      SELECT c.competency_id INTO competency_id_val
      FROM public.competencies c
      WHERE LOWER(c.name) = LOWER(row_data->>'competency_name')
        AND c.role_id = role_id_val;
      
      IF competency_id_val IS NULL THEN
        error_rows := error_rows || jsonb_build_object(
          'row', row_data,
          'error', 'Competency not found for role: ' || (row_data->>'competency_name')
        );
        CONTINUE;
      END IF;

      -- Check if pro_move already exists (by role, competency, and text)
      SELECT pm.action_id INTO existing_id
      FROM public.pro_moves pm
      WHERE pm.role_id = role_id_val
        AND pm.competency_id = competency_id_val
        AND LOWER(pm.action_statement) = LOWER(row_data->>'text');

      IF existing_id IS NOT NULL THEN
        -- Update existing pro_move
        UPDATE public.pro_moves SET
          description = COALESCE(row_data->>'description', description),
          resources_url = COALESCE(row_data->>'resources_url', resources_url),
          intervention_text = COALESCE(row_data->>'intervention_text', intervention_text),
          active = COALESCE((row_data->>'active')::boolean, active),
          updated_at = now(),
          updated_by = auth.uid()
        WHERE action_id = existing_id;
        
        updated_count := updated_count + 1;
      ELSE
        -- Insert new pro_move
        INSERT INTO public.pro_moves (
          role_id, competency_id, action_statement, description, resources_url, intervention_text, active, updated_by
        ) VALUES (
          role_id_val,
          competency_id_val,
          row_data->>'text',
          row_data->>'description',
          row_data->>'resources_url',
          row_data->>'intervention_text',
          COALESCE((row_data->>'active')::boolean, true),
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

  -- Return results
  result := jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'errors', error_rows
  );

  RETURN result;
END;
$function$;