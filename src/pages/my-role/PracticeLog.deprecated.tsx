/**
 * @deprecated December 2024 - Replaced by mobile-optimized PracticeLog.tsx (formerly PracticeLogV2)
 * Uses ScoreHistoryV2 with card-based layout, stacked week headers, and rich domain colors.
 * This file is archived for reference only.
 */
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { Skeleton } from '@/components/ui/skeleton';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { StaffPriorityFocusTab } from '@/components/coach/StaffPriorityFocusTab';
import StatsScores from '@/pages/StatsScores';

export default function PracticeLog() {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });

  const { rawData, loading: scoresLoading } = useStaffAllWeeklyScores({ staffId: staffProfile?.id });

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
      
      {/* Priority Focus */}
      {scoresLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <StaffPriorityFocusTab rawData={rawData} />
      )}
      
      {/* Score History */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold px-1">Score History</h3>
        <StatsScores />
      </div>
    </div>
  );
}
