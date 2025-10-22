import { useEffect, useRef, useState } from 'react';
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

  const [lastKnownTimestamp, setLastKnownTimestamp] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);

  const checkRoleChanges = async () => {
    if (!userId || !enabled || !isVisibleRef.current) return;

    try {
      const { data, error } = await supabase
        .from('staff')
        .select('roles_updated_at')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error checking role updates:', error);
        return;
      }

      if (!data) return;

      const dbTimestamp = data.roles_updated_at;

      // Initialize on first check
      if (lastKnownTimestamp === null) {
        setLastKnownTimestamp(dbTimestamp);
        return;
      }

      // Check if roles have been updated
      if (dbTimestamp && dbTimestamp !== lastKnownTimestamp) {
        console.log('Role change detected, refreshing...');
        setLastKnownTimestamp(dbTimestamp);
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
  }, [userId, enabled, lastKnownTimestamp]);

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
  }, [userId, enabled, pollInterval, lastKnownTimestamp]);

  return { checkRoleChanges };
}
