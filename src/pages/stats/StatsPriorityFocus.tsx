import { Skeleton } from '@/components/ui/skeleton';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { StaffPriorityFocusTab } from '@/components/coach/StaffPriorityFocusTab';

export default function StatsPriorityFocus() {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });

  const { rawData, loading: scoresLoading } = useStaffAllWeeklyScores({ staffId: staffProfile?.id });

  if (profileLoading || scoresLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!staffProfile) {
    return <p className="text-muted-foreground text-center py-8">No profile found.</p>;
  }

  return <StaffPriorityFocusTab rawData={rawData} />;
}
