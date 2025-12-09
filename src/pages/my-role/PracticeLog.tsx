import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Skeleton } from '@/components/ui/skeleton';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import StatsScores from '@/pages/StatsScores';

export default function PracticeLog() {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!staffProfile) {
    return <p className="text-muted-foreground text-center py-8">No profile found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* On-Time Submissions Widget */}
      <OnTimeRateWidget staffId={staffProfile.id} />
      
      
      {/* Score History */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold px-1">Score History</h3>
        <StatsScores />
      </div>
    </div>
  );
}
