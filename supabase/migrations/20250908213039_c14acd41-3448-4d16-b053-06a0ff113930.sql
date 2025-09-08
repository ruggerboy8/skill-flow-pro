-- Fix search_path security issues for the remaining functions
CREATE OR REPLACE FUNCTION public.rewrite_backfill_week(p_staff_id uuid, p_role_id integer, p_cycle integer, p_week integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_loc_id uuid;
  v_tz text;
  v_start_date date;
  v_cycle_len int;
  v_week_idx int;
  v_monday_local timestamp without time zone;
  v_conf_local  timestamp without time zone;
  v_perf_local  timestamp without time zone;
  v_conf_utc    timestamptz;
  v_perf_utc    timestamptz;
begin
  -- Look up staff's location + location config
  select s.primary_location_id
    into v_loc_id
  from staff s
  where s.id = p_staff_id;

  if v_loc_id is null then
    raise notice 'No primary_location_id for staff %', p_staff_id;
    return;
  end if;

  select l.timezone,
         l.program_start_date::date,
         l.cycle_length_weeks
    into v_tz, v_start_date, v_cycle_len
  from locations l
  where l.id = v_loc_id;

  if v_tz is null then
    -- default to CT if missing
    v_tz := 'America/Chicago';
  end if;

  -- Which absolute week (0-based) is this cycle/week?
  v_week_idx := (p_cycle - 1) * v_cycle_len + (p_week - 1);

  -- Monday 00:00 LOCAL for that week
  v_monday_local := (v_start_date + (v_week_idx * 7))::timestamp;

  -- Pick canonical "submitted" times INSIDE program windows:
  -- Confidence: Mon 09:00 local; Performance: Fri 15:00 local
  v_conf_local := v_monday_local + time '09:00:00';
  v_perf_local := v_monday_local + interval '4 days' + time '15:00:00';

  -- Convert local -> UTC instants
  v_conf_utc := v_conf_local at time zone v_tz;
  v_perf_utc := v_perf_local at time zone v_tz;

  -- Update ONLY the backfill rows for that week
  update weekly_scores ws
     set confidence_date   = v_conf_utc,
         performance_date  = v_perf_utc,
         confidence_late   = false,
         performance_late  = false,
         updated_at        = now()
  from weekly_focus wf
  where ws.staff_id = p_staff_id
    and ws.weekly_focus_id = wf.id
    and wf.role_id = p_role_id
    and wf.cycle = p_cycle
    and wf.week_in_cycle = p_week
    and ws.confidence_source = 'backfill'
    and ws.performance_source = 'backfill';
end
$function$;

CREATE OR REPLACE FUNCTION public.update_evaluations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;