import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarPlus, FileText, Video } from 'lucide-react';
import { format } from 'date-fns';
import { type DoctorJourneyStatus } from '@/lib/doctorStatus';
import { MeetingScheduleDialog } from '@/components/clinical/MeetingScheduleDialog';
import { DirectorPrepComposer } from '@/components/clinical/DirectorPrepComposer';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string;
  meeting_link?: string | null;
}

interface Props {
  doctor: { id: string; name: string; email: string; created_at: string | null; locations: any };
  baseline: { id: string; status: string | null; started_at: string | null; completed_at: string | null } | null;
  sessions: Session[];
  journeyStatus: DoctorJourneyStatus;
}

export function DoctorDetailOverview({ doctor, baseline, sessions, journeyStatus }: Props) {
  const { data: myStaff } = useStaffProfile();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [prepSessionId, setPrepSessionId] = useState<string | null>(null);
  const [showPrepSheet, setShowPrepSheet] = useState(false);

  const upcomingSession = sessions
    .filter(s => ['scheduled', 'director_prep_ready', 'doctor_prep_submitted'].includes(s.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  const needsPrepSession = sessions.find(s => s.status === 'scheduled');
  const viewablePrepSession = sessions.find(s => ['director_prep_ready', 'doctor_prep_submitted', 'doctor_confirmed', 'meeting_pending'].includes(s.status));

  const isDoctorPrepSubmitted = viewablePrepSession && ['doctor_prep_submitted', 'doctor_confirmed', 'meeting_pending'].includes(viewablePrepSession.status);

  const { data: prepSelections } = useQuery({
    queryKey: ['session-selections-all', viewablePrepSession?.id],
    queryFn: async () => {
      if (!viewablePrepSession?.id) return [];
      const { data: sels, error: selErr } = await supabase
        .from('coaching_session_selections')
        .select('action_id, selected_by, display_order')
        .eq('session_id', viewablePrepSession.id);
      if (selErr) throw selErr;
      if (!sels?.length) return [];

      const actionIds = sels.map(s => s.action_id);
      const { data: moves, error: movErr } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          competencies!fk_pro_moves_competency_id (
            name,
            domains!competencies_domain_id_fkey (domain_name)
          )
        `)
        .in('action_id', actionIds);
      if (movErr) throw movErr;

      const moveMap = (moves || []).reduce((acc: any, m: any) => { acc[m.action_id] = m; return acc; }, {});
      return sels.map(s => ({ ...s, pro_moves: moveMap[s.action_id] || null }));
    },
    enabled: !!viewablePrepSession?.id,
  });

  const { data: viewableSessionFull } = useQuery({
    queryKey: ['coaching-session', viewablePrepSession?.id],
    queryFn: async () => {
      if (!viewablePrepSession?.id) return null;
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('*')
        .eq('id', viewablePrepSession.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!viewablePrepSession?.id,
  });

  if (prepSessionId) {
    return (
      <DirectorPrepComposer
        sessionId={prepSessionId}
        doctorStaffId={doctor.id}
        onBack={() => setPrepSessionId(null)}
      />
    );
  }

  const hasActiveSession = sessions.some(s => 
    ['scheduled', 'director_prep_ready', 'doctor_prep_submitted', 'meeting_pending', 'doctor_revision_requested'].includes(s.status)
  );
  const canSchedule = baseline?.status === 'completed' && !hasActiveSession;
  const hasConfirmedSession = sessions.some(s => s.status === 'doctor_confirmed');
  const scheduleLabel = hasConfirmedSession ? 'Schedule Follow-up' : 'Schedule Baseline Review';

  return (
    <div className="space-y-4">
      {/* Schedule Button */}
      {canSchedule && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Ready to schedule</p>
              <p className="text-xs text-muted-foreground">
                {hasConfirmedSession
                  ? 'Schedule the next follow-up check-in.'
                  : 'The baseline is complete. Schedule the review meeting.'}
              </p>
            </div>
            <Button onClick={() => setScheduleOpen(true)} className="gap-2">
              <CalendarPlus className="h-4 w-4" />
              {scheduleLabel}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Continue prep for a scheduled session */}
      {needsPrepSession && (
        <Card className="border-primary/30">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Meeting scheduled</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(needsPrepSession.scheduled_at), 'EEEE, MMMM d \'at\' h:mm a')} — Build your agenda.
              </p>
            </div>
            <Button onClick={() => setPrepSessionId(needsPrepSession.id)}>
              Build Meeting Agenda
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Meeting with quick actions */}
      {upcomingSession && upcomingSession.status !== 'scheduled' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">
                {upcomingSession.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${upcomingSession.sequence_number - 1}`}
              </span>
              {' — '}
              {format(new Date(upcomingSession.scheduled_at), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
            </p>
            <div className="flex gap-2">
              {viewablePrepSession && !isDoctorPrepSubmitted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPrepSessionId(viewablePrepSession.id)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  View / Edit Prep
                </Button>
              )}
              {viewablePrepSession && isDoctorPrepSubmitted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPrepSheet(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Prep Summary
                </Button>
              )}
              {upcomingSession.meeting_link && (
                <a href={upcomingSession.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Video className="h-3.5 w-3.5" />
                    Join Meeting
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prep Summary Sheet */}
      <Sheet open={showPrepSheet} onOpenChange={setShowPrepSheet}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Meeting Prep Summary</SheetTitle>
            {viewableSessionFull && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(viewableSessionFull.scheduled_at), 'EEEE, MMMM d \'at\' h:mm a')}
              </p>
            )}
          </SheetHeader>
          {viewableSessionFull && prepSelections && (
            <CombinedPrepView
              session={viewableSessionFull}
              selections={prepSelections as any}
              coachName={myStaff?.name || 'Alex'}
              doctorName={doctor.name}
            />
          )}
        </SheetContent>
      </Sheet>

      {myStaff && (
        <MeetingScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          doctorStaffId={doctor.id}
          coachStaffId={myStaff.id}
          onCreated={(id) => setPrepSessionId(id)}
        />
      )}
    </div>
  );
}
