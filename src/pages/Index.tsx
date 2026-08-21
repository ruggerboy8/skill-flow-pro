import { lazy, Suspense } from 'react';
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
import { RouteLoadingFallback } from '@/components/RouteLoadingFallback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Wrench, ArrowRight, ChevronRight, Users } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';

// PRF-3: participants never render this branch, but Index is the eager
// landing page every user's first load pulls in, so a static import here
// would drag the whole regional dashboard (and everything it embeds) back
// into the initial bundle. Lazy so it only loads for the coach/regional/admin
// roles that actually take this branch.
const RegionalDashboard = lazy(() => import('@/pages/dashboard/RegionalDashboard'));

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
    // PRF-3 QA fix: this boundary is already inside Layout's viewport-
    // constrained <main>, so its fallback must be content-scoped
    // (fullScreen={false}) rather than min-h-screen -- a full-viewport
    // fallback here fought Layout's own Outlet-level Suspense and produced
    // an oversized content region / transient scrolling on cold-load.
    return (
      <Suspense fallback={<RouteLoadingFallback fullScreen={false} />}>
        <RegionalDashboard />
      </Suspense>
    );
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
            <Alert className="border-brand-signal/30 bg-brand-signal/10 dark:border-brand-navy dark:bg-brand-navy/30">
              <Wrench className="h-4 w-4 text-brand-blue" />
              <AlertTitle className="text-brand-navy dark:text-brand-signal">Backfill Access Enabled</AlertTitle>
              <AlertDescription className="text-brand-blue dark:text-brand-signal/90">
                <p className="mb-2">
                  Your admin has enabled backfill for missing confidence scores.
                  You have <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> to submit missing scores.
                </p>
                <Button asChild variant="outline" size="sm" className="border-brand-signal/50 text-brand-blue hover:bg-brand-signal/10 dark:border-brand-navy dark:text-brand-signal dark:hover:bg-brand-navy/40">
                  <Link to="/my-role/practice-log">
                    Go to Practice Log <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* rank: eval-ready */}
          <EvalReadyCard />

          {/* rank: recent-win — an earned win ranks above recognition */}
          <RecentWinBanner />

          {/* rank: recognition (MOB-5) — the featured glow, or generic
              encouragement when there isn't one yet. Never empty. */}
          <RecognitionCard />

          {/* rank: current-focus */}
          <CurrentFocusCard />

          {/* rank: focus-value (MOB-3) — the value card: script/audio if the
              focus move has one, else its description, else its action
              statement. Never an empty shell; absent when no focus is chosen. */}
          <FocusMoveValueCard />

          {/* rank: lead-focus, lead-meeting-request — Ariyana's weekly focus
              (display-only, no longer a disguised nav target — MOB-ADJUST-1
              item 1 QA feedback: tapping the focus card to reach /team read
              as mislabeled navigation) + the meeting-request card, plus a
              separate, explicitly-labeled "My Team" row to reach the roster. */}
          {staffProfile?.is_lead && (
            <>
              <LeadFocusHomeCard isLead={staffProfile.is_lead} />
              <LeadMeetingRequestCard staffId={staffProfile.id} isLead={staffProfile.is_lead} />
              <button
                type="button"
                onClick={() => navigate('/team')}
                className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 min-h-[56px] text-left active:bg-primary/5"
              >
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
                >
                  <Users className="h-4 w-4" />
                </div>
                <span className="flex-1 text-[15px] font-semibold">My Team</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
              </button>
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
          <Alert className="border-brand-signal/30 bg-brand-signal/10 dark:border-brand-navy dark:bg-brand-navy/30">
            <Wrench className="h-4 w-4 text-brand-blue" />
            <AlertTitle className="text-brand-navy dark:text-brand-signal">Backfill Access Enabled</AlertTitle>
            <AlertDescription className="text-brand-blue dark:text-brand-signal/90">
              <p className="mb-2">
                Your admin has enabled backfill for missing confidence scores.
                You have <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> to submit missing scores.
              </p>
              <Button asChild variant="outline" size="sm" className="border-brand-signal/50 text-brand-blue hover:bg-brand-signal/10 dark:border-brand-navy dark:text-brand-signal dark:hover:bg-brand-navy/40">
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