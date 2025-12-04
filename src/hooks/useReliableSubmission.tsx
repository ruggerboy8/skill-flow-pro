import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';

type ScoreUpdate = {
  staff_id: string;
  weekly_focus_id: string;
  selected_action_id?: number | null;
  confidence_score?: number | null;
  performance_score?: number | null;
  confidence_source?: 'backfill' | 'live' | 'backfill_historical';
  performance_source?: 'backfill' | 'live' | 'backfill_historical';
  entered_by?: string | null;
  week_of?: string | null; // Monday date of the week (YYYY-MM-DD format)
};

type PayloadConfidence = {
  kind: 'confidence';
  updates: ScoreUpdate[];
};

type PayloadPerformance = {
  kind: 'performance';
  updates: ScoreUpdate[];
  resolveBacklogActionIds?: number[];
  staffId?: string;
};

type SubmissionData = PayloadConfidence | PayloadPerformance;

interface SubmissionItem {
  id: string;
  userId: string;
  version: 1;
  attempts: number;
  lastAttempt: number;
  maxRetries: number;
  data: SubmissionData;
}

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const JITTER = 300;

export function useReliableSubmission() {
  const { user } = useAuth();
  const v2Enabled = useWeeklyAssignmentsV2Enabled;
  const STORAGE_KEY = user ? `pending_submissions:${user.id}` : 'pending_submissions:anon';
  const [pending, setPending] = useState<SubmissionItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queueRef = useRef<SubmissionItem[]>([]);
  queueRef.current = pending;

  // Load on mount / user change
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    try {
      const parsed = raw ? (JSON.parse(raw) as SubmissionItem[]) : [];
      // Filter out stale submissions (older than 24 hours)
      const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      const filtered = parsed.filter(p => 
        p.userId === user?.id && 
        (now - p.lastAttempt) < MAX_AGE_MS
      );
      setPending(filtered);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }, [STORAGE_KEY, pending]);

  // Helpers
  const jittered = (attempt: number) =>
    Math.min(BASE_DELAY * Math.pow(2, attempt) + Math.random() * JITTER, 30000);

  const addSubmission = useCallback((data: SubmissionData) => {
    const item: SubmissionItem = {
      id: `${data.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: user?.id || 'anon',
      version: 1,
      attempts: 0,
      lastAttempt: 0,
      maxRetries: MAX_RETRIES,
      data,
    };
    setPending(prev => [...prev, item]);
    return item.id;
  }, [user?.id]);

  const removeSubmission = useCallback((id: string) => {
    setPending(prev => prev.filter(i => i.id !== id));
  }, []);

  // Core writers
  const writeWeeklyScores = async (updates: ScoreUpdate[]) => {
    if (!updates?.length) return;
    
    // Extract assignment IDs that need validation
    const assignmentIds = updates
      .map(u => u.weekly_focus_id)
      .filter(id => /^assign:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      .map(id => id.replace('assign:', ''));
    
    // Validate assignment IDs exist and are not superseded (prevents stale session submissions)
    if (assignmentIds.length > 0) {
      const { data: validAssignments, error: validationError } = await supabase
        .from('weekly_assignments')
        .select('id')
        .in('id', assignmentIds)
        .is('superseded_at', null);
      
      if (validationError) {
        console.error('[Submission] Error validating assignments:', validationError);
        throw validationError;
      }
      
      const validIds = new Set(validAssignments?.map(a => a.id) || []);
      const invalidIds = assignmentIds.filter(id => !validIds.has(id));
      
      if (invalidIds.length > 0) {
        console.error('[Submission] Stale assignment IDs detected:', invalidIds);
        toast({
          title: 'Session expired',
          description: 'Your session is stale. Please refresh the page and try again.',
          variant: 'destructive',
        });
        throw new Error('STALE_SESSION: Assignment IDs are no longer valid. Please refresh the page.');
      }
    }
    
    // Validate and enrich updates before sending
    const enrichedUpdates = await Promise.all(updates.map(async (update) => {
      const focusId = update.weekly_focus_id;
      
      // Validate focus ID format (supports plan:<id>, assign:<uuid>, or raw UUID)
      const isPlanId = /^plan:[0-9]+$/.test(focusId);
      const isAssignId = /^assign:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(focusId);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(focusId);
      
      if (!isPlanId && !isAssignId && !isUuid) {
        console.error('[Submission] Invalid focus ID format:', focusId);
        throw new Error(`Invalid weekly_focus_id format: ${focusId}. Expected 'plan:<id>', 'assign:<uuid>', or UUID.`);
      }
      
      // Reject deprecated synthetic format (plan-{action}-{order})
      if (focusId.startsWith('plan-') && focusId.includes('-')) {
        console.error('[Submission] Detected deprecated synthetic ID format:', focusId);
        throw new Error(`Deprecated ID format detected: ${focusId}. Please refresh the page to load the latest data.`);
      }
      
      // Log when we're about to upsert a record with null scores
      if (update.confidence_score === null && update.performance_score === null) {
        console.warn('[Submission] Attempting to upsert record with both scores null:', update);
      }
      
      // Populate week_of if missing
      let weekOf = update.week_of;
      if (!weekOf) {
        if (isPlanId) {
          const planId = parseInt(focusId.replace('plan:', ''), 10);
          const { data: planData } = await supabase
            .from('weekly_plan')
            .select('week_start_date')
            .eq('id', planId)
            .single();
          weekOf = planData?.week_start_date || null;
        } else if (isAssignId) {
          const assignId = focusId.replace('assign:', '');
          const { data: assignData } = await supabase
            .from('weekly_assignments')
            .select('week_start_date')
            .eq('id', assignId)
            .single();
          weekOf = assignData?.week_start_date || null;
        } else {
          const { data: focusData } = await supabase
            .from('weekly_focus')
            .select('week_start_date')
            .eq('id', focusId)
            .single();
          weekOf = focusData?.week_start_date || null;
        }
      }
      
      console.info('[Submission] Writing score with focus_id=%s conf=%s perf=%s week_of=%s', 
        focusId, update.confidence_score, update.performance_score, weekOf);
      
      // Populate assignment_id for V2 weekly_assignments
      const enriched: any = { ...update, week_of: weekOf };
      if (isAssignId) {
        enriched.assignment_id = focusId;
      }
      
      return enriched;
    }));

    console.log(`[Submission] Writing ${enrichedUpdates.length} score updates`);
    
    // Always use staff_id,weekly_focus_id for conflict resolution since:
    // 1. There's a proper unique constraint on these columns that works with ON CONFLICT
    // 2. For V2 records, weekly_focus_id contains the 'assign:xxx' identifier
    // 3. The partial index on assignment_id doesn't support ON CONFLICT in PostgreSQL
    const conflictColumns = 'staff_id,weekly_focus_id';
    
    console.log(`[Submission] Using conflict columns: ${conflictColumns}`);
    
    const { error } = await supabase
      .from('weekly_scores')
      .upsert(enrichedUpdates, {
        onConflict: conflictColumns,
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error('[Submission] Error writing weekly scores:', error);
      throw error;
    }
  };

  const resolveBacklog = async (staffId: string, actionIds: number[]) => {
    if (!actionIds?.length) return;
    await Promise.allSettled(
      actionIds.map(actionId =>
        supabase.rpc('resolve_backlog_item', { p_staff_id: staffId, p_action_id: actionId })
      )
    );
  };

  // Legacy data types for backwards compatibility
  type LegacyConfidenceData = {
    updates: any[];
    selfSelectInserts?: any[];
  };

  type LegacyPerformanceData = {
    updates: any[];
    staffId?: string;
    resolveBacklogItems?: number[];
  };

  type LegacySubmissionData = LegacyConfidenceData | LegacyPerformanceData;

  // Handle self-select data by updating weekly_scores.selected_action_id
  const handleSelfSelections = async (selfSelectInserts: any[]) => {
    if (!selfSelectInserts?.length) return;
    
    for (const selection of selfSelectInserts) {
      // Find the existing score record and update its selected_action_id
      const { error } = await supabase
        .from('weekly_scores')
        .update({ selected_action_id: selection.selected_pro_move_id })
        .eq('staff_id', selection.user_id) // Note: selfSelectInserts uses user_id but we need staff_id
        .eq('weekly_focus_id', selection.weekly_focus_id);
      
      if (error) {
        console.error('Error updating self-selection:', error);
        // Don't fail the entire submission for this
      }
    }
  };

  const attempt = useCallback(async (item: SubmissionItem) => {
    try {
      console.log(`[Submission] Attempting ${item.data.kind} submission for item ${item.id}`);
      
      if (item.data.kind === 'confidence') {
        await writeWeeklyScores(item.data.updates);
      } else {
        await writeWeeklyScores(item.data.updates);
        if (item.data.staffId && item.data.resolveBacklogActionIds?.length) {
          console.log(`[Submission] Resolving backlog for ${item.data.resolveBacklogActionIds.length} actions`);
          await resolveBacklog(item.data.staffId, item.data.resolveBacklogActionIds);
        }
      }
      
      console.log(`[Submission] Successfully completed ${item.data.kind} submission for item ${item.id}`);
      removeSubmission(item.id);
      return true;
    } catch (e) {
      console.error(`[Submission] Attempt failed for item ${item.id}:`, e);
      return false;
    }
  }, [removeSubmission]);

  // Legacy API support
  const submitWithRetry = useCallback(async (kind: 'confidence' | 'performance', data: LegacySubmissionData) => {
    // Transform legacy data to new format
    let submissionData: SubmissionData;
    
    if (kind === 'confidence') {
      const legacyData = data as LegacyConfidenceData;
      // Handle self-selections by updating selected_action_id in the updates
      if (legacyData.selfSelectInserts?.length) {
        // Update the weekly_scores records with selected_action_id
        for (const selection of legacyData.selfSelectInserts) {
          const updateIndex = legacyData.updates.findIndex(
            update => update.weekly_focus_id === selection.weekly_focus_id
          );
          if (updateIndex >= 0) {
            legacyData.updates[updateIndex].selected_action_id = selection.selected_pro_move_id;
          }
        }
      }
      
      submissionData = {
        kind: 'confidence',
        updates: legacyData.updates
      };
    } else {
      const legacyData = data as LegacyPerformanceData;
      submissionData = {
        kind: 'performance',
        updates: legacyData.updates,
        resolveBacklogActionIds: legacyData.resolveBacklogItems,
        staffId: legacyData.staffId
      };
    }

    const id = addSubmission(submissionData);
    // fire an immediate attempt
    const ok = await attempt({
      id,
      userId: user?.id || 'anon',
      version: 1,
      attempts: 1,
      lastAttempt: Date.now(),
      maxRetries: MAX_RETRIES,
      data: submissionData,
    });
    if (!ok) {
      toast({ title: 'Saving...', description: 'We\'ll keep retrying in the background.' });
      // ensure the state reflects first attempt
      setPending(prev => prev.map(p => p.id === id ? { ...p, attempts: 1, lastAttempt: Date.now() } : p));
    } else {
      toast({ title: 'Saved', description: `Your ${kind} scores are saved.` });
    }
    return ok;
  }, [addSubmission, attempt, toast, user?.id]);

  const processPendingSubmissions = useCallback(async () => {
    if (isSubmitting || !queueRef.current.length) return;
    setIsSubmitting(true);

    // iterate over a snapshot to avoid mutation surprises
    const snapshot = [...queueRef.current];
    for (const item of snapshot) {
      // re-find latest copy in state (may have been removed)
      const current = queueRef.current.find(i => i.id === item.id);
      if (!current) continue;

      const now = Date.now();
      if (current.attempts >= current.maxRetries) {
        toast({
          title: 'Submission failed',
          description: `Couldn't save after ${current.maxRetries} attempts.`,
          variant: 'destructive',
        });
        removeSubmission(current.id);
        continue;
      }

      const requiredDelay = jittered(current.attempts);
      const since = now - current.lastAttempt;
      if (current.attempts > 0 && since < requiredDelay) continue;

      // bump attempts
      setPending(prev =>
        prev.map(i => i.id === current.id ? { ...i, attempts: i.attempts + 1, lastAttempt: now } : i)
      );

      const ok = await attempt({ ...current, attempts: current.attempts + 1, lastAttempt: now });
      if (ok) {
        toast({ 
          title: 'Recovered submission', 
          description: `Previously pending ${current.data.kind} scores have been saved.` 
        });
      }
      // small pause
      await new Promise(r => setTimeout(r, 120));
    }

    setIsSubmitting(false);
  }, [attempt, isSubmitting, removeSubmission, toast, jittered]);

  // Triggers
  useEffect(() => {
    const onFocus = () => processPendingSubmissions();
    const onOnline = () => processPendingSubmissions();
    const onVisible = () => document.visibilityState === 'visible' && processPendingSubmissions();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    // try once on mount when we have items
    if (pending.length) processPendingSubmissions();
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pending.length, processPendingSubmissions]);

  useEffect(() => {
    // best-effort poke before tab close
    const onBeforeUnload = () => {
      if (queueRef.current.length) {
        // no async work here; just ensure latest snapshot is persisted
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queueRef.current));
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [STORAGE_KEY]);

  return {
    submitWithRetry,
    pendingCount: pending.length,
    isProcessing: isSubmitting,
    processPendingSubmissions,
  };
}