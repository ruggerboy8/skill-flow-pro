import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useSim } from '@/devtools/SimProvider';
import { detectBackfillStatus } from '@/lib/backfillDetection';

export function useBackfillStatus() {
  const { user } = useAuth();
  const { overrides } = useSim();
  const [isBackfillComplete, setIsBackfillComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsBackfillComplete(null);
      return;
    }

    async function checkBackfillStatus() {
      try {
        // Use the centralized backfill detection logic that supports simulation
        const status = await detectBackfillStatus(user.id, overrides.enabled ? overrides : undefined);
        setIsBackfillComplete(status.isComplete);
      } catch (error) {
        console.error('Error checking backfill status:', error);
        setIsBackfillComplete(false);
      }
    }

    checkBackfillStatus();
  }, [user, overrides]); // Add overrides as dependency

  return { isBackfillComplete };
}