import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useBackfillStatus() {
  const { user } = useAuth();
  const [isBackfillComplete, setIsBackfillComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsBackfillComplete(null);
      return;
    }

    async function checkBackfillStatus() {
      try {
        // Check if user has any historical weekly scores
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', user!.id)
          .single();

        if (!staffData) {
          setIsBackfillComplete(false);
          return;
        }

        const { data: existingScores } = await supabase
          .from('weekly_scores')
          .select('id')
          .eq('staff_id', staffData.id)
          .limit(1);

        // If user has existing scores, backfill is complete
        if (existingScores && existingScores.length > 0) {
          setIsBackfillComplete(true);
          return;
        }

        // Check localStorage for backfill progress
        try {
          const raw = localStorage.getItem('backfillProgress');
          if (raw) {
            const progress = JSON.parse(raw) as Record<string, boolean>;
            const progressCount = Object.values(progress).filter(Boolean).length;
            setIsBackfillComplete(progressCount >= 6);
          } else {
            setIsBackfillComplete(false);
          }
        } catch {
          setIsBackfillComplete(false);
        }
      } catch (error) {
        console.error('Error checking backfill status:', error);
        setIsBackfillComplete(false);
      }
    }

    checkBackfillStatus();
  }, [user]);

  return { isBackfillComplete };
}