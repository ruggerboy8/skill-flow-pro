import { useUserRole } from '@/hooks/useUserRole';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useMobileShell } from '@/hooks/useMobileShell';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { RecentWinBanner } from '@/components/home/RecentWinBanner';
import { EvalReadyCard } from '@/components/home/EvalReadyCard';
import { CurrentFocusCard } from '@/components/home/CurrentFocusCard';
import { FocusMoveValueCard } from '@/components/home/FocusMoveValueCard';
import { RecognitionCard } from '@/components/home/RecognitionCard';
import { LeadFocusHomeCard } from '@/components/home/LeadFocusHomeCard';
import { LeadMeetingRequestCard } from '@/components/home/LeadMeetingRequestCard';
import { Skeleton } from '@/components/ui/skeleton';
import RegionalDashboard from '@/pages/dashboard/RegionalDashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Wrench, ArrowRight, ChevronRight } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';

export default function Index() {
  const { isParticipant, showRegionalDashboard, isDoctor, isOrgAdmin, isSuperAdmin, isLoading } = useUserRole();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const isMobileShell = useMobileShell();
  const navigate = useNavigate();

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

  // Admins / regional managers / coaches land on Command Center even if also a doctor.
  // They can reach /doctor via the sidebar "Doctor" link.
  if (showRegionalDashboard || isOrgAdmin || isSuperAdmin) {
    return <RegionalDashboard />;
  }

  // Pure doctors (no admin/coach role) → Doctor home (baseline assessment)
  if (isDoctor) {
    return <Navigate to="/doctor" replace />;
  }

  // Mobile shell: ProMoves first, CTA beneath — see
  // docs/features/mobile-build-instructions.md section C. Entirely separate
  // branch so the desktop return below stays byte-identical.
  //
  // Card order follows HOME_FEED_ORDER (src/lib/homeFeedOrder.ts), the single
  // documented ranking rule for this feed (MOB-3). ThisWeekPanel (the ritual
  // hero + CTA) is pinned first in every week-state; everything below it is a
  // ranked, conditionally-present card. Each block below is tagged with its
  // HOME_FEED_ORDER id so a future card (MOB-5 recognition, broadcast comms)
  // can be inserted at the right rank instead of by trial and error.
  if (isMobileShell) {
    const firstName = staffProfile?.name?.split(' ')[0] || 'there';
    const dateEyebrow = format(new Date(), 'EEEE, MMM d');

    return (
      <div className="px-0 py-2">
        <div className="space-y-4">
          <div>
            <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
              {dateEyebrow}
            </p>
            <h1 className="text-[22px] font-bold tracking-tight mt-0.5">Hi, {firstName}</h1>
          </div>

          {/* rank: ritual-hero — pinned first, always */}
          <ThisWeekPanel />

          {/* rank: backfill-alert */}
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

          {/* rank: eval-ready */}
          <EvalReadyCard />

          {/* rank: recognition (MOB-5) — the featured glow, or generic
              encouragement when there isn't one yet. Never empty. */}
          <RecognitionCard />

          {/* rank: recent-win */}
          <RecentWinBanner />

          {/* rank: current-focus */}
          <CurrentFocusCard />

          {/* rank: focus-value (MOB-3) — the value card: script/audio if the
              focus move has one, else its description, else its action
              statement. Never an empty shell; absent when no focus is chosen. */}
          <FocusMoveValueCard />

          {/* rank: lead-focus, lead-meeting-request — Ariyana's weekly focus +
              scheduling, at the bottom on mobile. The card wraps in a
              pressable that navigates to /team (section F); LeadFocusHomeCard
              itself is untouched. */}
          {staffProfile?.is_lead && (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/team')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate('/team');
                  }
                }}
                className="relative cursor-pointer active:opacity-90"
              >
                <LeadFocusHomeCard isLead={staffProfile.is_lead} />
                <ChevronRight className="h-4 w-4 text-muted-foreground absolute top-3.5 right-4 pointer-events-none" />
              </div>
              <LeadMeetingRequestCard staffId={staffProfile.id} isLead={staffProfile.is_lead} />
            </>
          )}

          {/* Deadline disclaimer — coaching-voice rewrite (MOB-3). Not a feed
              card (it's a persistent footer note, not ranked), so it isn't in
              HOME_FEED_ORDER. */}
          <div className="rounded-none border-y border-border bg-muted/50 p-3 text-center">
            <p className="text-sm text-muted-foreground">
              Pro Moves are due the same day as your Check In/Out meeting.
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Submit after that and it's marked late. Your coach sees it, so they know to check in with you.
            </p>
          </div>
        </div>
      </div>
    );
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

        {/* Leads (staff.is_lead): Ariyana's weekly focus + scheduling, replacing the
            retired "Lead Pro Move" dual-panel. */}
        {staffProfile?.is_lead && (
          <>
            <LeadFocusHomeCard isLead={staffProfile.is_lead} />
            <LeadMeetingRequestCard staffId={staffProfile.id} isLead={staffProfile.is_lead} />
          </>
        )}

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