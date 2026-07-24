import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Skeleton } from '@/components/ui/skeleton';

type RoleInfo = ReturnType<typeof useUserRole>;

/**
 * Route-level access guard. Renders `children` only when `allow(role)` is true;
 * otherwise redirects home. Mirrors the self-guard idiom used by ClinicalLayout /
 * AdminPage, but as a reusable wrapper so routes that don't self-guard (e.g. the
 * coach, dashboard, and facilitate surfaces) get a consistent, capability-based
 * check without touching their internals. Uses useUserRole, so it is
 * capability-preferred and masquerade-aware — the same source the sidebar uses.
 */
export function RequireAccess({
  allow,
  children,
  redirectTo = '/',
}: {
  allow: (role: RoleInfo) => boolean;
  children: ReactNode;
  redirectTo?: string;
}) {
  const role = useUserRole();

  if (role.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return allow(role) ? <>{children}</> : <Navigate to={redirectTo} replace />;
}

/** Coach audience: coaches, leads, admins, or explicit eval capabilities. */
export const allowCoachSurface = (r: RoleInfo) =>
  r.isCoach || r.isLead || r.isOrgAdmin || r.isSuperAdmin || r.canViewSubmissions || r.canSubmitEvals;

/**
 * Facilitate audience: the people who actually run check-in/check-out meetings —
 * functional directors / regional managers / admins. Leads and OMs are coach-surface
 * users but not facilitators (owner decision, 2026-07-25 persona walkthrough).
 * The !isParticipant condition is load-bearing: several lead RDAs carry org-wide
 * coach_scopes rows, which makes them isRegional — but they are participants, and
 * participants never facilitate.
 */
export const allowFacilitate = (r: RoleInfo) =>
  (r.isSuperAdmin || r.isOrgAdmin || r.isRegional) && !r.isParticipant;

/**
 * Staff-evaluation audience: evaluators/admins (and OMs for their location).
 * Leads see the coach surface but not evaluations (owner decision, 2026-07-25).
 * Must match showEvalsTab in StaffDetailV2.tsx.
 */
export const allowStaffEvals = (r: RoleInfo) =>
  r.canSubmitEvals || r.canReviewEvals || r.isOrgAdmin || r.isSuperAdmin || r.isOfficeManager;

/** Regional dashboard ("Command Center") audience: admins, regional managers, coaches. */
export const allowDashboard = (r: RoleInfo) =>
  r.isSuperAdmin || r.isOrgAdmin || r.isRegional || r.isCoach || r.canAccessAdmin;
