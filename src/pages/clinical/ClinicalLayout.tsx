import { Outlet, Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClinicalLayout() {
  const { canAccessClinical, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="space-y-6 p-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccessClinical) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  );
}