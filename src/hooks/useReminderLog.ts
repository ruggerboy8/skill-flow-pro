import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getChicagoMonday } from '@/lib/plannerUtils';

export type ReminderType = 'confidence' | 'performance';

export interface ReminderInfo {
  sent_at: string;
  sender_user_id: string;
  sender_name: string; // resolved first name, or "you", or "a manager"
}

export type ReminderMap = Map<string, ReminderInfo>; // key: `${target_user_id}|${type}`

interface UseReminderLogResult {
  reminderMap: ReminderMap;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Fetches reminder_log entries sent during the given week (Monday-keyed),
 * keyed by `${target_user_id}|${type}`. Resolves sender first names via
 * the staff table. Current user's name is replaced with "you".
 */
export function useReminderLog(weekOf: string | null): UseReminderLogResult {
  const [reminderMap, setReminderMap] = useState<ReminderMap>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!weekOf) return;
    setLoading(true);
    try {
      const monday = getChicagoMonday(weekOf);
      const lowerBoundUtc = new Date(`${monday}T00:00:00Z`).toISOString();

      const { data: logRows, error } = await supabase
        .from('reminder_log')
        .select('target_user_id, type, sent_at, sender_user_id')
        .gte('sent_at', lowerBoundUtc)
        .in('type', ['confidence', 'performance'])
        .order('sent_at', { ascending: false });

      if (error) throw error;

      // Most recent per (target_user_id, type)
      const latestByKey = new Map<string, { sent_at: string; sender_user_id: string }>();
      const senderIds = new Set<string>();
      for (const row of (logRows ?? []) as any[]) {
        const key = `${row.target_user_id}|${row.type}`;
        if (!latestByKey.has(key)) {
          latestByKey.set(key, { sent_at: row.sent_at, sender_user_id: row.sender_user_id });
          if (row.sender_user_id) senderIds.add(row.sender_user_id);
        }
      }

      // Resolve sender first names
      const senderNames = new Map<string, string>();
      const { data: { user } } = await supabase.auth.getUser();
      const currentUid = user?.id;

      if (senderIds.size > 0) {
        const { data: senders } = await supabase
          .from('staff')
          .select('user_id, name')
          .in('user_id', Array.from(senderIds));
        for (const s of (senders ?? []) as any[]) {
          if (s.user_id && s.name) {
            senderNames.set(s.user_id, String(s.name).split(' ')[0]);
          }
        }
      }

      const next: ReminderMap = new Map();
      for (const [key, val] of latestByKey.entries()) {
        const isMe = currentUid && val.sender_user_id === currentUid;
        const sender_name = isMe
          ? 'you'
          : senderNames.get(val.sender_user_id) || 'a manager';
        next.set(key, { ...val, sender_name });
      }
      setReminderMap(next);
    } catch (e) {
      console.warn('[useReminderLog] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [weekOf]);

  useEffect(() => { load(); }, [load]);

  return { reminderMap, loading, reload: load };
}
