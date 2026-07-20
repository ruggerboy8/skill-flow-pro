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

/** Coach / facilitate audience: coaches, leads, admins, or explicit eval capabilities. */
export const allowCoachSurface = (r: RoleInfo) =>
  r.isCoach || r.isLead || r.isOrgAdmin || r.isSuperAdmin || r.canViewSubmissions || r.canSubmitEvals;

/** Regional dashboard ("Command Center") audience: admins, regional managers, coaches. */
export const allowDashboard = (r: RoleInfo) =>
  r.isSuperAdmin || r.isOrgAdmin || r.isRegional || r.isCoach || r.canAccessAdmin;
