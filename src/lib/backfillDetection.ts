import { supabase } from '@/integrations/supabase/client';
import { SimOverrides } from '@/devtools/SimProvider';

export interface BackfillStatus {
  needsBackfill: boolean;
  isComplete: boolean;
  progressCount: number;
}

/**
 * Detects if user needs to complete backfill wizard
 * Checks for:
 * 1. Existing weekly scores (if none exist, user is new)
 * 2. LocalStorage backfill progress
 * 3. Simulation overrides for testing
 */
export async function detectBackfillStatus(
  userId: string, 
  simOverrides?: SimOverrides
): Promise<BackfillStatus> {
  // Check simulation overrides for forcing new user state
  let hasExistingScores = false;

  if (simOverrides?.enabled && simOverrides.forceNewUser !== null) {
    // Simulation override: forceNewUser controls whether user appears to have existing scores
    hasExistingScores = !simOverrides.forceNewUser;
  } else {
    // Normal logic: check if user has any historical weekly scores
    const { data: staffData } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!staffData) {
      return { needsBackfill: true, isComplete: false, progressCount: 0 };
    }

    const { data: existingScores } = await supabase
      .from('weekly_scores')
      .select('id')
      .eq('staff_id', staffData.id)
      .limit(1);

    hasExistingScores = !!(existingScores && existingScores.length > 0);
  }

  // If user has existing scores, they don't need backfill
  if (hasExistingScores) {
    return { needsBackfill: false, isComplete: true, progressCount: 6 };
  }

  // User needs backfill - check localStorage for progress
  let progressCount = 0;
  let isComplete = false;

  try {
    const raw = localStorage.getItem('backfillProgress');
    if (raw) {
      const progress = JSON.parse(raw) as Record<string, boolean>;
      progressCount = Object.values(progress).filter(Boolean).length;
      isComplete = progressCount >= 6;
    }
  } catch {
    // localStorage error, treat as no progress
  }

  // Apply simulation override for backfill completion if set
  if (simOverrides?.enabled && simOverrides.forceBackfillComplete !== null) {
    isComplete = simOverrides.forceBackfillComplete;
  }

  return { 
    needsBackfill: true, 
    isComplete,
    progressCount 
  };
}