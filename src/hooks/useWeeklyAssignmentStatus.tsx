import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WeeklyAssignment {
  focus_id: string;
  action_statement: string;
  domain_name: string;
  required: boolean;
  source: 'focus' | 'plan';
  confidence_score: number | null;
  confidence_date: string | null;
  performance_score: number | null;
  performance_date: string | null;
  display_order: number;
  self_select: boolean;
  competency_id: number | null;
  action_id: number | null;
}

export interface AssignmentStatus {
  required_count: number;
  conf_count: number;
  perf_count: number;
  conf_complete: boolean;
  perf_complete: boolean;
  last_activity_kind: 'confidence' | 'performance' | null;
  last_activity_at: string | null;
  backlog_count: number;
}

export interface WeekContext {
  cycle: number;
  week_in_cycle: number;
  week_of: string;
  source: 'focus' | 'plan';
}

export interface WeeklyAssignmentStatusData {
  assignments: WeeklyAssignment[];
  status: AssignmentStatus;
  week_context: WeekContext;
}

export interface UseWeeklyAssignmentStatusParams {
  staffId: string | undefined;
  roleId: number | undefined;
  weekStart: string | Date;
  enabled?: boolean;
}

/**
 * Unified hook for fetching weekly assignment status.
 * This is the single source of truth for all coach and staff surfaces.
 * 
 * Replaces:
 * - assembleCurrentWeek + computeWeekState (staff-facing)
 * - get_coach_roster_summary partial logic (coach dashboard)
 * - previous loadWeekData logic (coach detail)
 */
export function useWeeklyAssignmentStatus({
  staffId,
  roleId,
  weekStart,
  enabled = true,
}: UseWeeklyAssignmentStatusParams) {
  return useQuery({
    queryKey: ['weekly-assignment-status', staffId, roleId, weekStart],
    queryFn: async () => {
      if (!staffId || !roleId) {
        throw new Error('staffId and roleId are required');
      }

      // Normalize weekStart to YYYY-MM-DD format
      const weekStartDate = typeof weekStart === 'string' 
        ? weekStart 
        : weekStart.toISOString().split('T')[0];

      const { data, error } = await supabase.rpc('get_staff_week_assignments', {
        p_staff_id: staffId,
        p_role_id: roleId,
        p_week_start: weekStartDate,
      });

      if (error) throw error;
      if (!data) throw new Error('No data returned from get_staff_week_assignments');

      // Parse JSONB response
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed as WeeklyAssignmentStatusData;
    },
    enabled: enabled && !!staffId && !!roleId,
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}
