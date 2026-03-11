import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, Eye, FileText, Sparkles, Target } from 'lucide-react';
import { format } from 'date-fns';
import { drName } from '@/lib/doctorDisplayName';
import { formatInTimeZone } from 'date-fns-tz';

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MEETING_FMT = "EEEE, MMMM d 'at' h:mm a zzz";
import { getDoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';


export default function DoctorHome() {
  const { data: staff } = useStaffProfile();

  const { data: baseline } = useQuery({
    queryKey: ['my-baseline', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, completed_at')
        .eq('doctor_staff_id', staff.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  const { data: sessions } = useQuery({
    queryKey: ['my-coaching-sessions', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return [];
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('id, session_type, sequence_number, status, scheduled_at, meeting_link, coach_note')
        .eq('doctor_staff_id', staff.id)
        .order('sequence_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!staff?.id,
  });

  const journeyStatus = getDoctorJourneyStatus(
    baseline ? { status: baseline.status, completed_at: baseline.completed_at } : null,
    null, // doctor doesn't see coach baseline
    sessions || [],
    staff?.baseline_released_at,
    'doctor',
  );

  const displayName = staff?.name || 'Doctor';

  // Determine primary CTA
  const renderPrimaryCTA = () => {
    // Meeting confirmation needed — highest priority (requires doctor action)
    const pendingMeeting = sessions?.find(s => s.status === 'meeting_pending');
    if (pendingMeeting) {
      return (
        <Card className="border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-purple-600" />
              <div>
                <CardTitle>Review Meeting Summary</CardTitle>
                <CardDescription>
                  Your meeting summary is ready for review and confirmation.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to={`/doctor/review-prep/${pendingMeeting.id}`}>
              <Button className="w-full" variant="outline">Review & Confirm</Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Active prep needed — only after invite is sent
    const prepSession = sessions?.find(s => s.status === 'scheduling_invite_sent');
    if (prepSession) {
      return (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Complete Your Meeting Prep</CardTitle>
                <CardDescription>
                  {prepSession.scheduled_at
                    ? `Meeting on ${formatInTimeZone(new Date(prepSession.scheduled_at), LOCAL_TZ, MEETING_FMT)}`
                    : 'Your coach is ready to meet — prep before scheduling.'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Your agenda and discussion topics are ready for review. Add your own input before the meeting.
            </p>
            <Link to={`/doctor/review-prep/${prepSession.id}`}>
              <Button className="w-full">Start Prep</Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Doctor already submitted prep — let them review it
    const submittedPrepSession = sessions?.find(s => s.status === 'doctor_prep_submitted');
    if (submittedPrepSession) {
      return (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <CardTitle>Prep Submitted</CardTitle>
                <CardDescription>
                  {submittedPrepSession.scheduled_at
                    ? `Meeting on ${formatInTimeZone(new Date(submittedPrepSession.scheduled_at), LOCAL_TZ, MEETING_FMT)}`
                    : 'Your prep is submitted and shared with your coach.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Your prep is submitted. You can review it anytime before the meeting.
            </p>
            <Link to={`/doctor/review-prep/${submittedPrepSession.id}`}>
              <Button variant="outline" className="w-full gap-2">
                <Eye className="h-4 w-4" />
                View My Prep
              </Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Skip pre-invite sessions entirely — don't alert doctors about in-progress prep

    // Post-confirmation: show friendly "on track" message if coaching has started
    const hasConfirmedSession = sessions?.some(s => s.status === 'doctor_confirmed');
    if (hasConfirmedSession && baseline?.status === 'completed') {
      return (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>You're on Track</CardTitle>
                <CardDescription>
                  Your coaching journey is underway. Keep practicing your action steps and check back for your next session.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      );
    }

    // Baseline states — only show if no coaching sessions exist
    if (baseline?.status === 'completed') {
      return (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <CardTitle>Baseline Complete</CardTitle>
                <CardDescription>
                  {baseline.completed_at 
                    ? `Completed ${format(new Date(baseline.completed_at), 'MMMM d, yyyy')}`
                    : 'Your baseline self-assessment has been submitted.'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your clinical director will reach out to schedule a review conversation.
            </p>
            <Link to="/doctor/baseline-results">
              <Button variant="outline" className="w-full gap-2">
                <Eye className="h-4 w-4" />
                View My Baseline
              </Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Baseline released but not started — show CTA to begin
    if (staff?.baseline_released_at && !baseline) {
      return (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Your Baseline Is Ready</CardTitle>
                <CardDescription>
                  Your clinical director has opened your baseline self-assessment.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Take 15–20 minutes to rate yourself on each Pro Move. Your responses are private and help guide your coaching journey.
            </p>
            <Link to="/doctor/baseline">
              <Button className="w-full">Start Baseline Assessment</Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Default: friendly welcome — baseline will be initiated by clinical director
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Welcome to Your Portal</CardTitle>
              <CardDescription>
                Your clinical director will let you know when it's time to complete your baseline self-assessment.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            In the meantime, feel free to explore:
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link to="/doctor/my-role" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <Target className="h-4 w-4" />
                My Role
              </Button>
            </Link>
            <Link to="/doctor/my-team" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <ClipboardCheck className="h-4 w-4" />
                My Team
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };


  // All sessions with active action steps (confirmed or meeting_pending, not yet superseded)
  const activeSessionIds = sessions?.filter(s => 
    ['doctor_confirmed', 'meeting_pending'].includes(s.status)
  ).map(s => s.id) || [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome, {displayName}</h1>
        <p className="text-muted-foreground mt-2">Your professional development journey</p>
        <div className="mt-2">
          <DoctorJourneyStatusPill status={journeyStatus} />
        </div>
      </div>

      {/* Primary CTA */}
      {renderPrimaryCTA()}

      {/* Current Focus — action steps from all active sessions */}
      {activeSessionIds.length > 0 && <CurrentFocusCard sessionIds={activeSessionIds} />}

    </div>
  );
}

function CurrentFocusCard({ sessionIds }: { sessionIds: string[] }) {
  const { data: meetingRecords } = useQuery({
    queryKey: ['meeting-records-focus', sessionIds],
    queryFn: async () => {
      if (!sessionIds.length) return [];
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('session_id, experiments')
        .in('session_id', sessionIds);
      if (error) throw error;
      return data || [];
    },
    enabled: sessionIds.length > 0,
  });

  const allSteps = (meetingRecords || []).flatMap(
    r => ((r.experiments as any[] | null) || []).map((step: any) => ({ ...step, sessionId: r.session_id }))
  );

  if (allSteps.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Current Focus</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {allSteps.map((step: any, i: number) => (
          <div key={i} className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-sm font-medium">{step.title}</p>
            {step.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
