import { useState, useEffect } from 'react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { Skeleton } from '@/components/ui/skeleton';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { StaffPriorityFocusTab } from '@/components/coach/StaffPriorityFocusTab';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

// Import the score history logic from StatsScores
import StatsScores from '@/pages/StatsScores';

export default function PracticeLog() {
  const [focusOpen, setFocusOpen] = useState(true);
  
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
      
      {/* Priority Focus - Collapsible */}
      <Collapsible open={focusOpen} onOpenChange={setFocusOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card border rounded-lg hover:bg-muted/50 transition-colors">
          <h3 className="text-lg font-semibold">Priority Focus Areas</h3>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${focusOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {scoresLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <StaffPriorityFocusTab rawData={rawData} />
          )}
        </CollapsibleContent>
      </Collapsible>
      
      {/* Score History */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold px-1">Score History</h3>
        <StatsScores />
      </div>
    </div>
  );
}
