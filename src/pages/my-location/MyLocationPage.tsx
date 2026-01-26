import { Navigate } from 'react-router-dom';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Skeleton } from '@/components/ui/skeleton';
import LocationDetail from '@/pages/dashboard/LocationDetail';

/**
 * MyLocationPage - Office Manager view of their location
 * 
 * This page wraps the existing LocationDetail component but:
 * 1. Automatically scopes to the Office Manager's primary_location_id
 * 2. Hides the "Back to Regional Dashboard" button
 * 3. Disables coaching actions (reminders, evaluations)
 */
export default function MyLocationPage() {
  const { data: staffProfile, isLoading, error } = useStaffProfile({
    redirectToSetup: true,
    showErrorToast: true
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !staffProfile) {
    return <Navigate to="/" replace />;
  }

  // Verify user is an office manager
  if (!staffProfile.is_office_manager) {
    return <Navigate to="/" replace />;
  }

  // Redirect if no primary location
  if (!staffProfile.primary_location_id) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">No Location Assigned</h2>
        <p className="text-muted-foreground mt-2">
          You don't have a primary location assigned yet. Please contact your administrator.
        </p>
      </div>
    );
  }

  // Render LocationDetail with the office manager's location
  // The isOfficeManager prop tells LocationDetail to hide coaching actions
  return (
    <LocationDetail 
      overrideLocationId={staffProfile.primary_location_id}
      isOfficeManagerView={true}
    />
  );
}