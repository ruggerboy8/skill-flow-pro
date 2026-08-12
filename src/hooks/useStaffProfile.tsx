import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { useSim } from '@/devtools/SimProvider';

export interface UserCapabilities {
  is_participant: boolean;
  participation_start_at: string | null;
  can_view_submissions: boolean;
  can_submit_evals: boolean;
  can_review_evals: boolean;
  can_invite_users: boolean;
  can_manage_library: boolean;
  can_manage_locations: boolean;
  can_manage_users: boolean;
  can_manage_assignments: boolean;
  is_org_admin: boolean;
  is_platform_admin: boolean;
}

export interface StaffProfile {
  id: string;
  name?: string;
  role_id: number | null;
  primary_location_id: string | null;
  organization_id: string | null;
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
  allow_backfill_until: string | null;
  baseline_released_at: string | null;
  baseline_released_by: string | null;
  scheduling_link: string | null;
  roles: {
    archetype_code: string | null;
    role_name: string | null;
  } | null;
  locations: {
    group_id: string;
    program_start_date: string;
    cycle_length_weeks: number;
    timezone?: string;
    conf_due_day?: number;
    conf_due_time?: string;
    perf_due_day?: number;
    perf_due_time?: string;
    practice_groups?: {
      organization_id: string | null;
      organizations?: {
        practice_type: string | null;
      } | null;
    } | null;
  } | null;
  coach_scopes: {
    scope_type: 'org' | 'location';
    scope_id: string;
  }[];
  // Doctors this staff member is assigned to coach (doctor-coach model,
  // 2026-08-06). Non-empty ⇒ they get the scoped Clinical surface.
  mentee_assignments: {
    doctor_staff_id: string;
  }[];
  // New: granular capability toggles. null = no user_capabilities row yet (fall back to staff flags).
  user_capabilities: UserCapabilities | null;
}

interface UseStaffProfileOptions {
  redirectToSetup?: boolean; // Default true - redirect to /setup if no staff record
  showErrorToast?: boolean;  // Default true - show toast on error
}

// Shared across every mounted consumer of the hook so one failed fetch cannot
// stack up a dozen identical toasts.
let lastProfileErrorToastAt = 0;

export function useStaffProfile(options: UseStaffProfileOptions = {}) {
  const { redirectToSetup = true, showErrorToast = true } = options;
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { overrides } = useSim();

  // Support masquerade: if masqueradeStaffId is set, query by staff.id instead of user_id
  const masqueradeStaffId = overrides.enabled ? overrides.masqueradeStaffId : null;

  const query = useQuery({
    queryKey: ['staff-profile', user?.id, masqueradeStaffId],
    queryFn: async () => {
      if (!user && !masqueradeStaffId) throw new Error('No authenticated user');

      // 1) Primary staff row — scalar columns only. This must never depend on
      // RLS for related tables, otherwise a single restricted join breaks the
      // whole profile ("Failed to load profile") for legitimate users.
      let queryBuilder = supabase
        .from('staff')
        .select(`
          id,
          name,
          role_id,
          primary_location_id,
          organization_id,
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
          allow_backfill_until,
          baseline_released_at,
          baseline_released_by,
          scheduling_link
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

      const raw = data as any;

      // 2) Optional related data — each is best-effort; failures degrade
      // gracefully instead of blocking sign-in.
      const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          return await fn();
        } catch (e) {
          console.warn('Staff profile: optional data unavailable', e);
          return fallback;
        }
      };

      const [roles, locations, coachScopes, menteeAssignments, caps] = await Promise.all([
        raw.role_id
          ? safe(async () => {
              const { data } = await supabase
                .from('roles')
                .select('archetype_code, role_name')
                .eq('role_id', raw.role_id)
                .maybeSingle();
              return (data as any) ?? null;
            }, null)
          : Promise.resolve(null),
        raw.primary_location_id
          ? safe(async () => {
              const { data } = await supabase
                .from('locations')
                .select(`
                  group_id,
                  program_start_date,
                  cycle_length_weeks,
                  timezone,
                  conf_due_day,
                  conf_due_time,
                  perf_due_day,
                  perf_due_time,
                  practice_groups!locations_org_fkey (
                    organization_id,
                    organizations!practice_groups_organization_id_fkey (
                      practice_type
                    )
                  )
                `)
                .eq('id', raw.primary_location_id)
                .maybeSingle();
              return (data as any) ?? null;
            }, null)
          : Promise.resolve(null),
        safe(async () => {
          const { data } = await supabase
            .from('coach_scopes')
            .select('scope_type, scope_id')
            .eq('staff_id', raw.id);
          return (data as any[]) ?? [];
        }, [] as any[]),
        safe(async () => {
          const { data } = await supabase
            .from('doctor_coach_assignments')
            .select('doctor_staff_id')
            .eq('coach_staff_id', raw.id);
          return (data as any[]) ?? [];
        }, [] as any[]),
        safe(async () => {
          const { data } = await supabase
            .from('user_capabilities')
            .select(`
              is_participant,
              participation_start_at,
              can_view_submissions,
              can_submit_evals,
              can_review_evals,
              can_invite_users,
              can_manage_library,
              can_manage_locations,
              can_manage_users,
              can_manage_assignments,
              is_org_admin,
              is_platform_admin
            `)
            .eq('staff_id', raw.id)
            .maybeSingle();
          return (data as any) ?? null;
        }, null),
      ]);

      return {
        ...raw,
        roles,
        locations,
        coach_scopes: coachScopes,
        mentee_assignments: menteeAssignments,
        user_capabilities: caps,
      } as StaffProfile;
    },
    // Wait for a real session before querying. Firing while the access token
    // is still being restored sends an anonymous request, RLS returns zero
    // rows (HTTP 200, empty), and we'd wrongly conclude "no staff profile".
    enabled: (!!user && !!session?.access_token) || !!masqueradeStaffId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    // A missing row right after sign-in is usually a token/propagation race,
    // not a genuinely missing profile — retry a few times before giving up.
    retry: (failureCount, error: any) =>
      error?.message === 'No staff profile found' && failureCount < 3,
    retryDelay: (attempt) => 400 * (attempt + 1),
  });

  // Handle errors via useEffect (React Query v5 pattern)
  useEffect(() => {
    if (query.error) {
      console.error('Staff profile error:', query.error);

      const error = query.error as any;
      // Don't redirect when masquerading
      if (!masqueradeStaffId && redirectToSetup && (error.code === 'PGRST116' || error.message === 'No staff profile found')) {
        // No staff record found. Route to the existing setup screen rather
        // than the retired /setup path, which otherwise falls through to 404.
        navigate('/setup-password');
      } else if (
        showErrorToast &&
        error.code !== 'PGRST116' &&
        error.message !== 'No staff profile found' &&
        Date.now() - lastProfileErrorToastAt > 10000
      ) {
        // Show toast for real errors only, and at most once per 10s — the hook
        // is mounted by many components sharing one query, so an unguarded
        // toast fires repeatedly for a single failure.
        lastProfileErrorToastAt = Date.now();
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
