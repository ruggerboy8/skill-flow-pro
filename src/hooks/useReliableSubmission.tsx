import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubmissionItem {
  id: string;
  type: 'confidence' | 'performance';
  data: any;
  attempts: number;
  lastAttempt: number;
  maxRetries: number;
}

const STORAGE_KEY = 'pending_submissions';
const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second

export function useReliableSubmission() {
  const [pendingSubmissions, setPendingSubmissions] = useState<SubmissionItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Load pending submissions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const items = JSON.parse(stored);
        setPendingSubmissions(items);
      } catch (e) {
        console.error('Error parsing stored submissions:', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save pending submissions to localStorage whenever they change
  useEffect(() => {
    if (pendingSubmissions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingSubmissions));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [pendingSubmissions]);

  // Retry failed submissions on app focus and network reconnection
  useEffect(() => {
    const handleFocus = () => processPendingSubmissions();
    const handleOnline = () => processPendingSubmissions();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    
    // Also process on mount if there are pending submissions
    if (pendingSubmissions.length > 0) {
      processPendingSubmissions();
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [pendingSubmissions]);

  const exponentialDelay = (attempt: number) => {
    return Math.min(BASE_DELAY * Math.pow(2, attempt), 30000); // Cap at 30 seconds
  };

  const addSubmission = useCallback((type: 'confidence' | 'performance', data: any) => {
    const item: SubmissionItem = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      attempts: 0,
      lastAttempt: 0,
      maxRetries: MAX_RETRIES
    };

    setPendingSubmissions(prev => [...prev, item]);
    return item.id;
  }, []);

  const removeSubmission = useCallback((id: string) => {
    setPendingSubmissions(prev => prev.filter(item => item.id !== id));
  }, []);

  const submitConfidenceScores = async (data: any) => {
    try {
      const { error } = await supabase
        .from('weekly_scores')
        .upsert(data.updates);

      if (error) throw error;

      // Save self-select choices if any
      if (data.selfSelectInserts && data.selfSelectInserts.length > 0) {
        const { error: selectError } = await supabase
          .from('weekly_self_select')
          .upsert(data.selfSelectInserts, {
            onConflict: 'user_id,weekly_focus_id,slot_index'
          });

        if (selectError) {
          console.error('Error saving self-selections:', selectError);
          // Don't fail the entire submission for this
        }
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  };

  const submitPerformanceScores = async (data: any) => {
    try {
      const { error } = await supabase
        .from('weekly_scores')
        .upsert(data.updates);

      if (error) throw error;

      // Resolve backlog items
      if (data.resolveBacklogItems) {
        for (const actionId of data.resolveBacklogItems) {
          await supabase.rpc('resolve_backlog_item', {
            p_staff_id: data.staffId,
            p_action_id: actionId
          });
        }
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  };

  const attemptSubmission = async (item: SubmissionItem): Promise<boolean> => {
    try {
      let result;
      if (item.type === 'confidence') {
        result = await submitConfidenceScores(item.data);
      } else {
        result = await submitPerformanceScores(item.data);
      }

      if (result.success) {
        removeSubmission(item.id);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Submission attempt failed for ${item.type}:`, error);
      return false;
    }
  };

  const processPendingSubmissions = async () => {
    if (isSubmitting || pendingSubmissions.length === 0) return;

    setIsSubmitting(true);

    for (const item of pendingSubmissions) {
      const now = Date.now();
      const timeSinceLastAttempt = now - item.lastAttempt;
      const requiredDelay = exponentialDelay(item.attempts);

      // Skip if not enough time has passed since last attempt
      if (item.attempts > 0 && timeSinceLastAttempt < requiredDelay) {
        continue;
      }

      // Skip if max retries exceeded
      if (item.attempts >= item.maxRetries) {
        // Show persistent error message
        toast({
          title: "Submission Failed",
          description: `Your ${item.type} scores couldn't be saved after ${item.maxRetries} attempts. Please contact support.`,
          variant: "destructive"
        });
        removeSubmission(item.id);
        continue;
      }

      // Update attempt count and timestamp
      setPendingSubmissions(prev => 
        prev.map(p => 
          p.id === item.id 
            ? { ...p, attempts: p.attempts + 1, lastAttempt: now }
            : p
        )
      );

      const success = await attemptSubmission(item);
      
      if (success) {
        toast({
          title: "Scores Saved",
          description: `Your ${item.type} scores have been successfully saved.`,
        });
      } else if (item.attempts + 1 < item.maxRetries) {
        // Will retry later, show gentle notice
        toast({
          title: "Retrying...",
          description: `Saving your ${item.type} scores (attempt ${item.attempts + 1}/${item.maxRetries})`,
        });
      }

      // Small delay between attempts to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsSubmitting(false);
  };

  const submitWithRetry = async (type: 'confidence' | 'performance', data: any) => {
    // Add to pending submissions
    const submissionId = addSubmission(type, data);
    
    // Try immediate submission
    const success = await attemptSubmission({
      id: submissionId,
      type,
      data,
      attempts: 1,
      lastAttempt: Date.now(),
      maxRetries: MAX_RETRIES
    });

    if (!success) {
      // Update the submission to mark first attempt
      setPendingSubmissions(prev => 
        prev.map(p => 
          p.id === submissionId 
            ? { ...p, attempts: 1, lastAttempt: Date.now() }
            : p
        )
      );

      toast({
        title: "Saving in progress...",
        description: "Your scores will be saved automatically. You can close the app safely.",
      });
    } else {
      toast({
        title: "Scores Saved",
        description: `Your ${type} scores have been saved successfully.`,
      });
    }

    return success;
  };

  return {
    submitWithRetry,
    pendingCount: pendingSubmissions.length,
    isProcessing: isSubmitting,
    processPendingSubmissions
  };
}