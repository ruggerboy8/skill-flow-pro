import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, Eye, Calendar, FileText, ChevronDown, FlaskConical, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MEETING_FMT = "EEEE, MMMM d 'at' h:mm a zzz";
import { getDoctorJourneyStatus } from '@/lib/doctorStatus';
import { DoctorJourneyStatusPill } from '@/components/clinical/DoctorJourneyStatusPill';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  );

  const displayName = staff?.name || 'Doctor';

  // Determine primary CTA
  const renderPrimaryCTA = () => {
    // Active prep needed — doctor needs to complete their side
    const prepSession = sessions?.find(s => s.status === 'director_prep_ready');
    if (prepSession) {
      return (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Complete Your Meeting Prep</CardTitle>
                <CardDescription>
                  Meeting on {formatInTimeZone(new Date(prepSession.scheduled_at), LOCAL_TZ, MEETING_FMT)}
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
                  Meeting on {formatInTimeZone(new Date(submittedPrepSession.scheduled_at), LOCAL_TZ, MEETING_FMT)}
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

    // Meeting scheduled but director hasn't prepped yet — show informational card
    const scheduledSession = sessions?.find(s => s.status === 'scheduled');
    if (scheduledSession) {
      return (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div>
                <CardTitle>Meeting Scheduled</CardTitle>
                <CardDescription>
                  {formatInTimeZone(new Date(scheduledSession.scheduled_at), LOCAL_TZ, MEETING_FMT)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your meeting is coming up. You'll get a notification when the agenda is ready for your review.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Meeting confirmation needed
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
                  Your coaching journey is underway. Keep practicing your experiments and check back for your next session.
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

    if (baseline?.status === 'in_progress') {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Continue Your Baseline</CardTitle>
                <CardDescription>You have an assessment in progress.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/doctor/baseline">
              <Button className="w-full">Continue Assessment</Button>
            </Link>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Complete Your Baseline</CardTitle>
              <CardDescription>Start your self-assessment to begin your development journey.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Link to="/doctor/baseline">
            <Button className="w-full">Start Baseline Assessment</Button>
          </Link>
        </CardContent>
      </Card>
    );
  };

  // Upcoming meetings
  const upcomingSessions = sessions?.filter(s => 
    ['scheduled', 'director_prep_ready', 'doctor_prep_submitted'].includes(s.status)
  ).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()) || [];

  // Completed sessions
  const completedSessions = sessions?.filter(s => s.status === 'doctor_confirmed')
    .sort((a, b) => b.sequence_number - a.sequence_number) || [];

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

      {/* Upcoming Meetings */}
      {upcomingSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming Meetings</h2>
          {upcomingSessions.map(session => (
            <Card key={session.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${session.sequence_number - 1}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatInTimeZone(new Date(session.scheduled_at), LOCAL_TZ, MEETING_FMT)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed Records */}
      {completedSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Past Coaching Sessions</h2>
          {completedSessions.map(session => (
            <CompletedSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedSessionCard({ session }: { session: { id: string; session_type: string; sequence_number: number; scheduled_at: string } }) {
  const [open, setOpen] = useState(false);

  const { data: meetingRecord } = useQuery({
    queryKey: ['meeting-record', session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('*')
        .eq('session_id', session.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const experiments = (meetingRecord?.experiments as any[] | null) || [];
  const typeLabel = session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${session.sequence_number - 1}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="transition-colors">
        <CollapsibleTrigger asChild>
          <CardContent className="flex items-center justify-between py-4 cursor-pointer hover:bg-muted/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{typeLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(session.scheduled_at), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {meetingRecord ? (
              <>
                {meetingRecord.summary && (
                  <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                    {meetingRecord.summary}
                  </div>
                )}
                {experiments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FlaskConical className="h-3.5 w-3.5" />
                      Experiments
                    </p>
                    {experiments.map((exp: any, i: number) => (
                      <div key={i} className="p-2 rounded-md bg-muted/30 border mb-1.5">
                        <p className="text-sm font-medium">{exp.title}</p>
                        {exp.description && <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            <Link to={`/doctor/review-prep/${session.id}`}>
              <Button variant="ghost" size="sm" className="w-full">View Full Record</Button>
            </Link>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
