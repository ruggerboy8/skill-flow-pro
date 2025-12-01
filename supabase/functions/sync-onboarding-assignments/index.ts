import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Location {
  id: string;
  name: string;
  program_start_date: string;
  cycle_length_weeks: number;
  organization_id: string;
}

interface WeeklyFocus {
  id: string;
  cycle: number;
  week_in_cycle: number;
  role_id: number;
  action_id: number | null;
  competency_id: number | null;
  self_select: boolean;
  display_order: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting onboarding assignments sync...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active locations with onboarding enabled
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select('id, name, program_start_date, cycle_length_weeks, organization_id')
      .eq('active', true)
      .eq('onboarding_active', true);

    if (locationsError) {
      throw new Error(`Failed to fetch locations: ${locationsError.message}`);
    }

    console.log(`📍 Found ${locations?.length || 0} active locations with onboarding`);

    // Get all onboarding weekly_focus templates (C1-C3)
    const { data: focusTemplates, error: focusError } = await supabase
      .from('weekly_focus')
      .select('id, cycle, week_in_cycle, role_id, action_id, competency_id, self_select, display_order')
      .gte('cycle', 1)
      .lte('cycle', 3)
      .order('cycle', { ascending: true })
      .order('week_in_cycle', { ascending: true })
      .order('display_order', { ascending: true });

    if (focusError) {
      throw new Error(`Failed to fetch focus templates: ${focusError.message}`);
    }

    console.log(`📚 Found ${focusTemplates?.length || 0} onboarding focus templates`);

    let totalInserted = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // For each location, generate assignments for all onboarding weeks
    for (const location of locations as Location[]) {
      console.log(`\n🏢 Processing location: ${location.name}`);

      for (const template of focusTemplates as WeeklyFocus[]) {
        // Calculate week_start_date for this location
        const programStart = new Date(location.program_start_date);
        const weeksOffset = (template.cycle - 1) * location.cycle_length_weeks + (template.week_in_cycle - 1);
        const weekStartDate = new Date(programStart);
        weekStartDate.setDate(weekStartDate.getDate() + weeksOffset * 7);
        const weekStartDateStr = weekStartDate.toISOString().split('T')[0];

        // Check if assignment already exists
        const { data: existing, error: checkError } = await supabase
          .from('weekly_assignments')
          .select('id')
          .eq('location_id', location.id)
          .eq('role_id', template.role_id)
          .eq('source', 'onboarding')
          .eq('week_start_date', weekStartDateStr)
          .eq('legacy_focus_id', template.id)
          .maybeSingle();

        if (checkError) {
          errors.push(`Check error for ${location.name} C${template.cycle}W${template.week_in_cycle}: ${checkError.message}`);
          continue;
        }

        if (existing) {
          totalSkipped++;
          continue;
        }

        // Insert new assignment
        const { error: insertError } = await supabase
          .from('weekly_assignments')
          .insert({
            week_start_date: weekStartDateStr,
            role_id: template.role_id,
            location_id: location.id,
            org_id: location.organization_id,
            source: 'onboarding',
            status: 'locked',
            display_order: template.display_order,
            action_id: template.action_id,
            competency_id: template.competency_id,
            self_select: template.self_select,
            legacy_focus_id: template.id,
          });

        if (insertError) {
          errors.push(`Insert error for ${location.name} C${template.cycle}W${template.week_in_cycle}: ${insertError.message}`);
          continue;
        }

        totalInserted++;
      }
    }

    const result = {
      success: true,
      locations_processed: locations?.length || 0,
      templates_processed: focusTemplates?.length || 0,
      assignments_inserted: totalInserted,
      assignments_skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('\n✅ Sync complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ Sync failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
