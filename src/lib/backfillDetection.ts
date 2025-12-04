import { supabase } from '@/integrations/supabase/client';

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
 */
export async function detectBackfillStatus(
  userId: string
): Promise<BackfillStatus> {
  // Check if user has any historical weekly scores
  let hasExistingScores = false;

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

  return { 
    needsBackfill: true, 
    isComplete,
    progressCount 
  };
}