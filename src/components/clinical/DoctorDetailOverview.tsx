import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Video, Send, CalendarPlus, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { type DoctorJourneyStatus } from '@/lib/doctorStatus';
import { DirectorPrepComposer } from '@/components/clinical/DirectorPrepComposer';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { SchedulingInviteComposer } from '@/components/clinical/SchedulingInviteComposer';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useToast } from '@/hooks/use-toast';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string | null;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prepSessionId, setPrepSessionId] = useState<string | null>(null);
  const [showPrepSheet, setShowPrepSheet] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('staff')
        .update({ baseline_released_at: new Date().toISOString(), baseline_released_by: user.id } as any)
        .eq('id', doctor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-detail'] });
      toast({ title: 'Baseline released', description: `${doctor.name} can now start their self-assessment.` });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleInviteSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['doctor-detail'] });
  };

  // Find session with prep ready (director has completed prep but hasn't invited yet)
  const prepReadySession = sessions.find(s => s.status === 'director_prep_ready');
  // Find session that needs prep built (just "scheduled" — legacy, or no session yet)
  const needsPrepSession = sessions.find(s => s.status === 'scheduled');
  const viewablePrepSession = sessions.find(s => ['director_prep_ready', 'scheduling_invite_sent', 'doctor_confirmed', 'meeting_pending'].includes(s.status));

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
    ['scheduled', 'director_prep_ready', 'scheduling_invite_sent', 'meeting_pending', 'doctor_revision_requested'].includes(s.status)
  );
  const canBuildPrep = baseline?.status === 'completed' && !hasActiveSession;
  const hasConfirmedSession = sessions.some(s => s.status === 'doctor_confirmed');
  const isNotReleased = journeyStatus.stage === 'invited';

  const handleOpenInviteDialog = () => setShowInviteDialog(true);

  return (
    <div className="space-y-4">
      {/* Release Baseline Button */}
      {isNotReleased && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Ready to release baseline?</p>
              <p className="text-xs text-muted-foreground">
                This will allow {doctor.name} to begin their self-assessment.
              </p>
            </div>
            <Button
              onClick={() => releaseMutation.mutate()}
              disabled={releaseMutation.isPending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {releaseMutation.isPending ? 'Releasing…' : 'Release Baseline'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Build Prep — both baselines complete, no active session */}
      {canBuildPrep && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Ready to prep</p>
              <p className="text-xs text-muted-foreground">
                {hasConfirmedSession
                  ? 'Build the agenda for the next follow-up check-in.'
                  : 'Both baselines are complete. Build your meeting agenda before inviting to schedule.'}
              </p>
            </div>
            <Button onClick={() => {
              // Create a session in "scheduled" status for prep, then open composer
              // We'll handle this by going into prep mode directly
              setPrepSessionId('new');
            }} className="gap-2">
              <FileText className="h-4 w-4" />
              Build Meeting Agenda
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Continue prep for a scheduled session */}
      {needsPrepSession && (
        <Card className="border-primary/30">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Continue building agenda</p>
              <p className="text-xs text-muted-foreground">
                Finish your meeting prep so you can invite the doctor to schedule.
              </p>
            </div>
            <Button onClick={() => setPrepSessionId(needsPrepSession.id)}>
              Build Meeting Agenda
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invite to Schedule — prep is done, ready to send invite */}
      {prepReadySession && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Prep complete — invite to schedule</p>
              <p className="text-xs text-muted-foreground">
                Send {doctor.name} a link to schedule their {prepReadySession.session_type === 'baseline_review' ? 'baseline review' : 'follow-up'} meeting.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrepSessionId(prepReadySession.id)}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Edit Prep
              </Button>
              <Button
                onClick={handleOpenInviteDialog}
                className="gap-2"
              >
                <Mail className="h-4 w-4" />
                Invite to Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Scheduling — invite sent */}
      {sessions.find(s => s.status === 'scheduling_invite_sent') && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Pending scheduling</p>
              <p className="text-xs text-muted-foreground">
                Waiting for {doctor.name} to schedule via the link you sent.
              </p>
            </div>
            {viewablePrepSession && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrepSheet(true)}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                View Prep
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prep Summary Sheet */}
      <Sheet open={showPrepSheet} onOpenChange={setShowPrepSheet}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Meeting Prep Summary</SheetTitle>
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

      {/* Scheduling Invite Composer */}
      <SchedulingInviteComposer
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        doctorName={doctor.name}
        doctorEmail={doctor.email}
        doctorStaffId={doctor.id}
        sessionId={prepReadySession?.id}
        onSuccess={handleInviteSuccess}
      />
    </div>
  );
}
