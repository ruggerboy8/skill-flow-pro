import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { Skeleton } from '@/components/ui/skeleton';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { StaffPriorityFocusTab } from '@/components/coach/StaffPriorityFocusTab';
import ScoreHistoryV2 from '@/components/my-role/ScoreHistoryV2';

export default function PracticeLogV2() {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });

  const { rawData, loading: scoresLoading } = useStaffAllWeeklyScores({ staffId: staffProfile?.id });

  if (profileLoading) {
    return (
      <div className="space-y-4">
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
    <div className="space-y-4">
      {/* On-Time Submissions Widget */}
      <OnTimeRateWidget staffId={staffProfile.id} />
      
      {/* Priority Focus */}
      {scoresLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <StaffPriorityFocusTab rawData={rawData} />
      )}
      
      {/* Score History V2 */}
      <ScoreHistoryV2 />
    </div>
  );
}
