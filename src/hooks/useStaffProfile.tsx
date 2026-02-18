import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { useSim } from '@/devtools/SimProvider';

export interface StaffProfile {
  id: string;
  name?: string;
  role_id: number | null;
  primary_location_id: string | null;
  coach_scope_type: string | null;
  coach_scope_id: string | null;
  is_super_admin: boolean;
  is_org_admin: boolean;
  is_participant: boolean;
  is_coach: boolean;
  is_lead: boolean;
  is_office_manager: boolean;
  is_doctor: boolean;
  is_clinical_director: boolean;
  is_paused: boolean;
  paused_at: string | null;
  pause_reason: string | null;
  home_route: string | null;
  allow_backfill_until: string | null;
  locations: {
    organization_id: string;
    program_start_date: string;
    cycle_length_weeks: number;
    timezone?: string;
    conf_due_day?: number;
    conf_due_time?: string;
    perf_due_day?: number;
    perf_due_time?: string;
  } | null;
  coach_scopes: {
    scope_type: 'org' | 'location';
    scope_id: string;
  }[];
}

interface UseStaffProfileOptions {
  redirectToSetup?: boolean; // Default true - redirect to /setup if no staff record
  showErrorToast?: boolean;  // Default true - show toast on error
}

export function useStaffProfile(options: UseStaffProfileOptions = {}) {
  const { redirectToSetup = true, showErrorToast = true } = options;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { overrides } = useSim();

  // Support masquerade: if masqueradeStaffId is set, query by staff.id instead of user_id
  const masqueradeStaffId = overrides.enabled ? overrides.masqueradeStaffId : null;

  const query = useQuery({
    queryKey: ['staff-profile', user?.id, masqueradeStaffId],
    queryFn: async () => {
      if (!user && !masqueradeStaffId) throw new Error('No authenticated user');

      let queryBuilder = supabase
        .from('staff')
        .select(`
          id,
          name,
          role_id,
          primary_location_id,
          coach_scope_type,
          coach_scope_id,
          is_super_admin,
          is_org_admin,
          is_participant,
          is_coach,
          is_lead,
          is_office_manager,
          is_doctor,
          is_clinical_director,
          is_paused,
          paused_at,
          pause_reason,
          home_route,
          allow_backfill_until,
          locations (
            organization_id,
            program_start_date,
            cycle_length_weeks,
            timezone,
            conf_due_day,
            conf_due_time,
            perf_due_day,
            perf_due_time
          ),
          coach_scopes (
            scope_type,
            scope_id
          )
        `);

      // If masquerading, query by staff.id; otherwise query by user_id
      if (masqueradeStaffId) {
        queryBuilder = queryBuilder.eq('id', masqueradeStaffId);
      } else {
        queryBuilder = queryBuilder.eq('user_id', user!.id);
      }

      const { data, error } = await queryBuilder.maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No staff profile found');
      }

      return data as StaffProfile;
    },
    enabled: !!user || !!masqueradeStaffId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on error - likely a missing profile
  });

  // Handle errors via useEffect (React Query v5 pattern)
  useEffect(() => {
    if (query.error) {
      console.error('Staff profile error:', query.error);
      
      const error = query.error as any;
      // Don't redirect when masquerading
      if (!masqueradeStaffId && redirectToSetup && (error.code === 'PGRST116' || error.message === 'No staff profile found')) {
        // No staff record found, redirect to setup
        navigate('/setup');
      } else if (showErrorToast && error.code !== 'PGRST116') {
        // Show toast for other errors (not missing profile)
        toast({
          title: 'Error',
          description: 'Failed to load profile',
          variant: 'destructive',
        });
      }
    }
  }, [query.error, redirectToSetup, showErrorToast, navigate, toast, masqueradeStaffId]);

  return query;
}
