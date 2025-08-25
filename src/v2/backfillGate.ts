// V2 server-truth gating for Backfill logic
import { supabase } from '@/integrations/supabase/client';

export interface BackfillGateResult {
  missingCount: number;
  totalSlots: number;
}

/**
 * Check if staff member needs backfill based on actual completion of Cycle 1, Weeks 1-6
 * Returns missing count and total slots for those weeks
 */
export async function needsBackfill(staffId: string, roleId: number): Promise<BackfillGateResult> {
  try {
    // Get all weekly_focus slots for Cycle 1, Weeks 1-6 for this role
    const { data: weeklyFocusSlots, error: focusError } = await supabase
      .from('weekly_focus')
      .select('id')
      .eq('cycle', 1)
      .in('week_in_cycle', [1, 2, 3, 4, 5, 6])
      .eq('role_id', roleId);

    if (focusError) {
      console.error('Error fetching weekly focus slots:', focusError);
      return { missingCount: 0, totalSlots: 0 };
    }

    const totalSlots = weeklyFocusSlots?.length || 0;

    if (totalSlots === 0) {
      // No slots configured for this role - no backfill needed
      return { missingCount: 0, totalSlots: 0 };
    }

    const weeklyFocusIds = weeklyFocusSlots.map(slot => slot.id);

    // Count completed scores (both confidence and performance non-null)
    const { data: completedScores, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id')
      .eq('staff_id', staffId)
      .in('weekly_focus_id', weeklyFocusIds)
      .not('confidence_score', 'is', null)
      .not('performance_score', 'is', null);

    if (scoresError) {
      console.error('Error fetching completed scores:', scoresError);
      return { missingCount: totalSlots, totalSlots };
    }

    const completedCount = completedScores?.length || 0;
    const missingCount = Math.max(0, totalSlots - completedCount);

    console.log('Backfill gate check:', {
      staffId,
      roleId,
      totalSlots,
      completedCount,
      missingCount
    });

    return { missingCount, totalSlots };
  } catch (error) {
    console.error('Error in needsBackfill:', error);
    return { missingCount: 0, totalSlots: 0 };
  }
}