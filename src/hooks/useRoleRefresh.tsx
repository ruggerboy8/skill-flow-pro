import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RoleRefreshOptions {
  enabled?: boolean;
  pollInterval?: number; // milliseconds
  onRoleChange?: () => void;
}

export function useRoleRefresh(
  userId: string | null,
  options: RoleRefreshOptions = {}
) {
  const {
    enabled = true,
    pollInterval = 60000, // 60 seconds default
    onRoleChange
  } = options;

  const lastKnownTimestampRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);

  const checkRoleChanges = async () => {
    if (!userId || !enabled || !isVisibleRef.current) return;

    try {
      const { data, error } = await supabase
        .from('staff')
        .select('roles_updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking role updates:', error);
        return;
      }

      if (!data) return;

      const dbTimestamp = data.roles_updated_at;

      // Initialize on first check
      if (lastKnownTimestampRef.current === null) {
        lastKnownTimestampRef.current = dbTimestamp;
        return;
      }

      // Check if roles have been updated
      if (dbTimestamp && dbTimestamp !== lastKnownTimestampRef.current) {
        console.log('Role change detected, refreshing...');
        lastKnownTimestampRef.current = dbTimestamp;
        onRoleChange?.();
      }
    } catch (err) {
      console.error('Unexpected error checking role updates:', err);
    }
  };

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      
      // Check immediately when tab becomes visible
      if (isVisibleRef.current && enabled && userId) {
        checkRoleChanges();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userId, enabled]);

  // Set up polling
  useEffect(() => {
    if (!enabled || !userId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkRoleChanges();

    // Set up polling interval
    pollIntervalRef.current = setInterval(checkRoleChanges, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [userId, enabled, pollInterval]);

  return { checkRoleChanges };
}
