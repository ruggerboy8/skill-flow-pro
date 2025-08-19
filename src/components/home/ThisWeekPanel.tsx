import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, nextMondayStr, getWeekAnchors, CT_TZ } from '@/lib/centralTime';
import { useNow } from '@/providers/NowProvider';
import { getDomainColor } from '@/lib/domainColors';
import { assembleWeek, WeekAssignment } from '@/lib/backlog';
import { computeWeekState, WeekContext, getCurrentISOWeek } from '@/lib/weekValidationSim';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';

interface Staff { id: string; role_id: number; }

export default function ThisWeekPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [weekContext, setWeekContext] = useState<WeekContext | null>(null);
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load staff profile
  useEffect(() => {
    if (user) void loadStaff();
  }, [user]);

  async function loadStaff() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/setup');
      return;
    }

    setStaff(data);
  }

  // Load current week data and compute state
  useEffect(() => {
    if (staff) void loadCurrentWeek();
  }, [staff, overrides]); // Re-run when simulation overrides change

  async function loadCurrentWeek() {
    if (!staff || !user) return;

    setLoading(true);

    try {
      console.log('=== DEBUGGING THISWEEKPANEL ===');
      console.log('Current time (now):', now);
      console.log('Staff:', staff);
      console.log('Simulation overrides:', overrides);
      
      // Use simulated time if available
      const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
      console.log('Effective time being used:', effectiveNow);
      
      // Compute current week state with simulation overrides
      const context = await computeWeekState(staff.id, effectiveNow, overrides);
      console.log('Week context:', context);
      setWeekContext(context);

      // Load current week assignments with simulation support
      const { iso_year, iso_week } = getCurrentISOWeek(effectiveNow);
      console.log('ISO week calculation:', { iso_year, iso_week });
      
      const assignments = await assembleWeek(user.id, iso_year, iso_week, staff.role_id, overrides);
      console.log('Week assignments:', assignments);
      console.log('Staff role_id:', staff.role_id);
      setWeekAssignments(assignments);

      setLoading(false);
    } catch (error) {
      console.error('Error loading current week:', error);
      toast({ title: 'Error', description: 'Failed to load current week data', variant: 'destructive' });
      setLoading(false);
    }
  }

  // Banner message and CTA based on current week state
  const { bannerMessage, bannerCta } = useMemo(() => {
    if (!weekContext || !staff) return { bannerMessage: '', bannerCta: null };

    // now comes from useNow() hook

    switch (weekContext.state) {
      case 'missed_checkin':
        return {
          bannerMessage: "Oops! You forgot to submit your Confidence scores this week. Don't worry, we'll get you back on track next week.",
          bannerCta: null
        };

      case 'can_checkin':
        return {
          bannerMessage: 'Welcome back! Time to rate your confidence for this week\'s Pro Moves.',
          bannerCta: {
            label: 'Rate Confidence',
            onClick: () => navigate(`/confidence/${weekContext.iso_week}/step/1`)
          }
        };

      case 'wait_for_thu':
        return {
          bannerMessage: 'Great! Come back Thursday to submit performance.',
          bannerCta: null
        };

      case 'can_checkout':
        return {
          bannerMessage: 'Time to reflect. Rate your performance for this week\'s Pro Moves.',
          bannerCta: {
            label: 'Rate Performance',
            onClick: () => navigate(`/performance/${weekContext.iso_week}/step/1`)
          }
        };

      case 'done':
        return {
          bannerMessage: '✓ All set for this week. Great work!',
          bannerCta: null
        };

      default:
        return {
          bannerMessage: 'Review your Pro Moves below.',
          bannerCta: null
        };
    }
  }, [weekContext, staff, navigate]);

  // Show loading state
  if (loading || !weekContext || !staff) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Show empty state when no pro moves found
  if (weekAssignments.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>No Pro Moves found for the current week.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Get Monday date for "Week of" display
  const { mondayZ } = getWeekAnchors(now, CT_TZ);
  const weekOfDate = formatInTimeZone(mondayZ, CT_TZ, 'MMM d, yyyy');

  // Show "missed checkin" state - hide pro moves and show message only
  if (weekContext.state === 'missed_checkin') {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Week of {weekOfDate}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted p-3">
            <div className="font-medium text-sm text-foreground text-center">{bannerMessage}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show normal view with pro moves and banner
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>This Week&apos;s Pro Moves</CardTitle>
        <CardDescription>Week of {weekOfDate}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pro Moves list */}
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confidence</span>
          </div>

          {weekAssignments.map((assignment, index) => {
            const domainName = assignment.domain_name;
            const bgColor = domainName ? getDomainColor(domainName) : undefined;
            const isUnchosen = assignment.type === 'selfSelect' && !assignment.action_statement;

            return (
              <div key={assignment.weekly_focus_id} className="rounded-lg p-4 border" style={bgColor ? { backgroundColor: bgColor } : undefined}>
                {domainName && (
                  <Badge variant="secondary" className="text-xs font-semibold mb-2 bg-white/80 text-gray-900" aria-label={`Domain: ${domainName}`}>
                    {domainName}
                  </Badge>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-medium flex-1">
                      {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
                    </p>
                  </div>
                  <div className="min-w-12 flex justify-end">
                    <span className="text-muted-foreground">—</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic banner message */}
        <div className="rounded-md border bg-muted p-3">
          <div className="font-medium text-sm text-foreground text-center">{bannerMessage}</div>
          {bannerCta && (
            <Button className="w-full h-12 mt-2" onClick={bannerCta.onClick} aria-label="Next action">
              {bannerCta.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}