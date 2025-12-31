import { useUserRole } from '@/hooks/useUserRole';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { RecentWinBanner } from '@/components/home/RecentWinBanner';
import { Skeleton } from '@/components/ui/skeleton';
import RegionalDashboard from '@/pages/dashboard/RegionalDashboard';

export default function Index() {
  const { isParticipant, showRegionalDashboard, isLoading } = useUserRole();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  // Non-participants (coaches/regional managers) → Command Center
  if (showRegionalDashboard) {
    return <RegionalDashboard />;
  }

  // Participants → Standard experience
  return (
    <div className="min-h-screen bg-background px-0 py-2 md:p-4">
      <div className="max-w-4xl mx-auto px-4 md:px-0 space-y-4">
        <RecentWinBanner />

        <ThisWeekPanel />
        
        {/* Deadline disclaimer */}
        <div className="rounded-none md:rounded-lg border-y md:border border-border bg-muted/50 p-3 md:p-4 text-center">
          <p className="text-sm text-muted-foreground">
            ProMove scores are due on the same day as your Check In/Out meeting.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Scores submitted any other time are marked late.
          </p>
        </div>
      </div>
    </div>
  );
}