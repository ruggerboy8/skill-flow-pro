import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaffDetailAssignment {
  id: string; // assignment_id with prefix
  actionStatement: string;
  domainName: string;
  isRequired: boolean;
  isSelfSelect: boolean;
  displayOrder: number;
  confidenceScore: number | null;
  performanceScore: number | null;
  confidenceLate: boolean | null;
  performanceLate: boolean | null;
  confidenceDate: string | null;
  performanceDate: string | null;
  actionId: number | null;
  competencyId: number | null;
}

export interface StaffDetailData {
  staff: {
    id: string;
    name: string;
    roleName: string;
    roleId: number;
    locationName: string;
    locationId: string;
    organizationName: string;
    organizationId: string;
    timezone: string;
  };
  week: {
    cycle: number;
    weekInCycle: number;
    weekOf: string;
    phase: string;
  };
  assignments: StaffDetailAssignment[];
  summary: {
    requiredCount: number;
    confSubmittedCount: number;
    perfSubmittedCount: number;
    confLateCount: number;
    perfLateCount: number;
    backlogCount: number;
  };
}

interface UseStaffDetailWeekParams {
  staffId: string | undefined;
  weekStart: string | Date;
  enabled?: boolean;
}

export function useStaffDetailWeek({
  staffId,
  weekStart,
  enabled = true,
}: UseStaffDetailWeekParams) {
  const weekStartDate = typeof weekStart === 'string' 
    ? weekStart 
    : weekStart.toISOString().split('T')[0];

  return useQuery({
    queryKey: ['staff-detail-week', staffId, weekStartDate],
    queryFn: async () => {
      if (!staffId) {
        throw new Error('staffId is required');
      }

      // Fetch staff metadata
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          role_id,
          primary_location_id,
          roles!inner(role_name),
          locations!inner(
            id,
            name,
            organization_id,
            timezone,
            organizations!inner(id, name)
          )
        `)
        .eq('id', staffId)
        .single();

      if (staffError) throw staffError;
      if (!staffData) throw new Error('Staff member not found');

      const staff = {
        id: staffData.id,
        name: staffData.name,
        roleName: (staffData.roles as any).role_name,
        roleId: staffData.role_id,
        locationName: (staffData.locations as any).name,
        locationId: (staffData.locations as any).id,
        organizationName: (staffData.locations as any).organizations.name,
        organizationId: (staffData.locations as any).organizations.id,
        timezone: (staffData.locations as any).timezone,
      };

      // Fetch week assignments via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_staff_week_assignments',
        {
          p_staff_id: staffId,
          p_role_id: staff.roleId,
          p_week_start: weekStartDate,
        }
      );

      if (rpcError) throw rpcError;

      const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
      const rawAssignments = parsed?.assignments || [];

      // Handle self-select: fetch user's choices
      const selfSelectIds = rawAssignments
        .filter((a: any) => a.self_select)
        .map((a: any) => a.focus_id);

      let selectionsMap: Record<string, any> = {};
      if (selfSelectIds.length > 0) {
        const { data: userSelections } = await supabase
          .from('weekly_self_select')
          .select(`
            weekly_focus_id,
            selected_pro_move_id,
            pro_moves(action_statement, competency_id, competencies(domain_id, domains(domain_name)))
          `)
          .eq('user_id', staffId)
          .in('weekly_focus_id', selfSelectIds);

        (userSelections ?? []).forEach((sel: any) => {
          selectionsMap[sel.weekly_focus_id] = sel;
        });
      }

      // Map assignments to UI format
      const assignments: StaffDetailAssignment[] = rawAssignments.map((raw: any) => {
        let actionStatement = raw.action_statement;
        let domainName = raw.domain_name;

        // Override with user selection if applicable
        if (raw.self_select && selectionsMap[raw.focus_id]) {
          const selection = selectionsMap[raw.focus_id];
          if (selection?.pro_moves) {
            actionStatement = selection.pro_moves.action_statement;
            if (selection.pro_moves.competencies?.domains?.domain_name) {
              domainName = selection.pro_moves.competencies.domains.domain_name;
            }
          }
        }

        return {
          id: raw.focus_id,
          actionStatement,
          domainName,
          isRequired: raw.required,
          isSelfSelect: raw.self_select,
          displayOrder: raw.display_order,
          confidenceScore: raw.confidence_score,
          performanceScore: raw.performance_score,
          confidenceLate: raw.confidence_late,
          performanceLate: raw.performance_late,
          confidenceDate: raw.confidence_date,
          performanceDate: raw.performance_date,
          actionId: raw.action_id,
          competencyId: raw.competency_id,
        };
      });

      const status = parsed?.status || {};
      const weekContext = parsed?.week_context || {};

      const confLateCount = assignments.filter(
        (a) => a.confidenceScore !== null && a.confidenceLate === true
      ).length;
      const perfLateCount = assignments.filter(
        (a) => a.performanceScore !== null && a.performanceLate === true
      ).length;

      const result: StaffDetailData = {
        staff,
        week: {
          cycle: weekContext.cycle || 0,
          weekInCycle: weekContext.week_in_cycle || 0,
          weekOf: weekStartDate,
          phase: weekContext.phase || 'unknown',
        },
        assignments,
        summary: {
          requiredCount: status.required_count || 0,
          confSubmittedCount: status.confidence_count || 0,
          perfSubmittedCount: status.performance_count || 0,
          confLateCount,
          perfLateCount,
          backlogCount: weekContext.backlog_count || 0,
        },
      };

      return result;
    },
    enabled: enabled && !!staffId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
