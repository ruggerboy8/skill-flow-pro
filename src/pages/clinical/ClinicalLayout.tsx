import { Outlet, Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';

export default function ClinicalLayout() {
  const { canAccessClinical, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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