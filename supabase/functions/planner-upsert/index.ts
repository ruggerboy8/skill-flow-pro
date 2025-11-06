import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RecommendRequest {
  action: 'recommend'
  roleId: number
  limit?: number
}

interface SaveWeekRequest {
  action: 'saveWeek'
  roleId: number
  weekStartDate: string
  picks: Array<{
    displayOrder: 1 | 2 | 3
    actionId: number | null
    generatedBy: 'manual' | 'auto'
  }>
  updaterUserId: string
}

type RequestBody = RecommendRequest | SaveWeekRequest

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const body: RequestBody = await req.json()

    if (body.action === 'recommend') {
      // Call sequencer-rank for recommendations
      const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId: body.roleId,
          limit: body.limit || 6,
        }
      })

      if (rankError) {
        console.error('Sequencer-rank error:', rankError)
        return new Response(
          JSON.stringify({ ok: false, error: rankError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            picks: rankData.picks || [],
            reasons: rankData.reasons || {},
            weights: rankData.weights || {},
            version: rankData.version || 'unknown',
            poolSize: rankData.poolSize || 0,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (body.action === 'saveWeek') {
      const { roleId, weekStartDate, picks, updaterUserId } = body
      const upserted: Array<{ id: number, displayOrder: number, actionId: number | null }> = []
      const skippedLocked: Array<{ id: number, displayOrder: number, actionId: number | null }> = []
      const deleted: Array<{ id: number, displayOrder: number }> = []

      // Process each slot
      for (const pick of picks) {
        // Check if row exists
        const { data: existing } = await supabase
          .from('weekly_plan')
          .select('id, action_id')
          .eq('org_id', null)
          .eq('role_id', roleId)
          .eq('week_start_date', weekStartDate)
          .eq('display_order', pick.displayOrder)
          .maybeSingle()

        if (existing) {
          // Check if locked (has scores)
          const { count } = await supabase
            .from('weekly_scores')
            .select('*', { count: 'exact', head: true })
            .eq('weekly_focus_id', `plan:${existing.id}`)

          if (count && count > 0) {
            // Slot is locked
            skippedLocked.push({
              id: existing.id,
              displayOrder: pick.displayOrder,
              actionId: existing.action_id || null,
            })
            continue
          }

          // If actionId is null, delete the row
          if (pick.actionId === null || pick.actionId === 0) {
            const { error: deleteError } = await supabase
              .from('weekly_plan')
              .delete()
              .eq('id', existing.id)

            if (deleteError) {
              console.error('Delete error:', deleteError)
              continue
            }

            deleted.push({
              id: existing.id,
              displayOrder: pick.displayOrder,
            })
          } else {
            // Update existing row
            const { error: updateError } = await supabase
              .from('weekly_plan')
              .update({
                action_id: pick.actionId,
                generated_by: pick.generatedBy,
                updated_by: updaterUserId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)

            if (updateError) {
              console.error('Update error:', updateError)
              continue
            }

            upserted.push({
              id: existing.id,
              displayOrder: pick.displayOrder,
              actionId: pick.actionId,
            })
          }
        } else if (pick.actionId && pick.actionId !== 0) {
          // Insert new row only if actionId is not null/0
          const { data: inserted, error: insertError } = await supabase
            .from('weekly_plan')
            .insert({
              org_id: null,
              role_id: roleId,
              week_start_date: weekStartDate,
              display_order: pick.displayOrder,
              action_id: pick.actionId,
              generated_by: pick.generatedBy,
              updated_by: updaterUserId,
              status: 'locked',
              self_select: false,
            })
            .select('id')
            .single()

          if (insertError) {
            console.error('Insert error:', insertError)
            continue
          }

          if (inserted) {
            upserted.push({
              id: inserted.id,
              displayOrder: pick.displayOrder,
              actionId: pick.actionId,
            })
          }
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            upserted,
            deleted,
            skippedLocked,
            updatedMeta: {
              updatedBy: updaterUserId,
              updatedAt: new Date().toISOString(),
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error) {
    console.error('Planner-upsert error:', error)
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
