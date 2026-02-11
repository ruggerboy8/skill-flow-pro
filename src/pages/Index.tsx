import { useUserRole } from '@/hooks/useUserRole';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { RecentWinBanner } from '@/components/home/RecentWinBanner';
import { EvalReadyCard } from '@/components/home/EvalReadyCard';
import { CurrentFocusCard } from '@/components/home/CurrentFocusCard';
import { Skeleton } from '@/components/ui/skeleton';
import RegionalDashboard from '@/pages/dashboard/RegionalDashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Wrench, ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';

export default function Index() {
  const { isParticipant, showRegionalDashboard, isDoctor, isLoading } = useUserRole();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });

  // Check if backfill is currently enabled
  const hasActiveBackfill = staffProfile?.allow_backfill_until && 
    new Date(staffProfile.allow_backfill_until) > new Date();
  const daysRemaining = hasActiveBackfill 
    ? differenceInDays(new Date(staffProfile.allow_backfill_until!), new Date())
    : 0;

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

  // Doctors → Doctor home (baseline assessment)
  if (isDoctor) {
    return <Navigate to="/doctor" replace />;
  }

  // Non-participants (coaches/regional managers) → Command Center
  if (showRegionalDashboard) {
    return <RegionalDashboard />;
  }

  // Participants → Standard experience
  return (
    <div className="min-h-screen bg-background px-0 py-2 md:p-4">
      <div className="max-w-4xl mx-auto px-4 md:px-0 space-y-4">
        {/* Backfill Notice Banner */}
        {hasActiveBackfill && (
          <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <Wrench className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">Backfill Access Enabled</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              <p className="mb-2">
                Your admin has enabled backfill for missing confidence scores. 
                You have <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> to submit missing scores.
              </p>
              <Button asChild variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900">
                <Link to="/my-role/practice-log">
                  Go to Practice Log <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <EvalReadyCard />

        <RecentWinBanner />

        <ThisWeekPanel />

        <CurrentFocusCard />
        
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