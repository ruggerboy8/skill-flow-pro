import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatInTimeZone } from 'date-fns-tz';
import { MessageSquare, ClipboardEdit, ChevronDown, FlaskConical, CheckCircle2, Clock, FileText, Mail, Plus, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MeetingOutcomeCapture } from '@/components/clinical/MeetingOutcomeCapture';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { DirectorPrepComposer } from '@/components/clinical/DirectorPrepComposer';
import { SchedulingInviteComposer } from '@/components/clinical/SchedulingInviteComposer';
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

const statusLabels: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  director_prep_ready: { label: 'Agenda Ready', className: 'bg-amber-100 text-amber-800' },
  scheduling_invite_sent: { label: 'Invite Sent', className: 'bg-blue-100 text-blue-800' },
  doctor_prep_submitted: { label: 'Doctor Prepped', className: 'bg-emerald-100 text-emerald-800' },
  meeting_pending: { label: 'Summary Shared', className: 'bg-purple-100 text-purple-800' },
  doctor_confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  doctor_revision_requested: { label: 'Doctor Left a Note', className: 'bg-amber-100 text-amber-800' },
};

const canCaptureStatus = (status: string) =>
  ['scheduling_invite_sent', 'doctor_prep_submitted', 'doctor_revision_requested'].includes(status);

const canBuildAgenda = (status: string) => status === 'scheduled';

const canInvite = (status: string) => status === 'director_prep_ready';

const isExpandable = (status: string) =>
  ['director_prep_ready', 'scheduling_invite_sent', 'doctor_prep_submitted', 'meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(status);

// Mid-flow statuses that block adding a new check-in
const midFlowStatuses = ['scheduled', 'director_prep_ready', 'scheduling_invite_sent', 'doctor_prep_submitted'];

interface Props {
  sessions: Session[];
  coachName?: string;
  doctorName?: string;
  doctorStaffId: string;
  doctorEmail: string;
}

export function DoctorDetailThread({ sessions, coachName = 'Your Coach', doctorName = 'Doctor', doctorStaffId, doctorEmail }: Props) {
  const { data: myStaff } = useStaffProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [prepSessionId, setPrepSessionId] = useState<string | null>(null);
  const [inviteSessionId, setInviteSessionId] = useState<string | null>(null);

  // Add Check-in mutation
  const addCheckinMutation = useMutation({
    mutationFn: async () => {
      if (!myStaff?.id) throw new Error('Not authenticated');
      const maxSeq = sessions.reduce((max, s) => Math.max(max, s.sequence_number), 0);
      const { error } = await supabase.from('coaching_sessions').insert({
        doctor_staff_id: doctorStaffId,
        coach_staff_id: myStaff.id,
        session_type: 'follow_up',
        sequence_number: maxSeq + 1,
        status: 'scheduled',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Check-in added', description: 'New follow-up session created. Build your agenda to get started.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleInviteSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['doctor-detail'] });
    setInviteSessionId(null);
  };

  // Full-page prep composer
  if (prepSessionId) {
    return (
      <DirectorPrepComposer
        sessionId={prepSessionId}
        doctorStaffId={doctorStaffId}
        doctorName={doctorName}
        doctorEmail={doctorEmail}
        onBack={() => setPrepSessionId(null)}
      />
    );
  }

  // Full-page meeting capture
  if (captureSessionId) {
    return (
      <MeetingOutcomeCapture
        sessionId={captureSessionId}
        onBack={() => setCaptureSessionId(null)}
      />
    );
  }

  const hasMidFlow = sessions.some(s => midFlowStatuses.includes(s.status));
  const sorted = [...sessions].sort((a, b) => b.sequence_number - a.sequence_number);

  return (
    <div className="space-y-3">
      {/* Add Check-in button */}
      {sessions.length > 0 && !hasMidFlow && (
        <Button
          variant="outline"
          className="w-full gap-2 border-dashed"
          onClick={() => addCheckinMutation.mutate()}
          disabled={addCheckinMutation.isPending}
        >
          <Plus className="h-4 w-4" />
          {addCheckinMutation.isPending ? 'Creating…' : 'Add Check-in'}
        </Button>
      )}

      {sessions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No coaching sessions yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete your prep above to begin the coaching thread.
            </p>
          </CardContent>
        </Card>
      )}

      {sorted.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          expanded={expandedId === session.id}
          onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
          onCapture={() => setCaptureSessionId(session.id)}
          onBuildAgenda={() => setPrepSessionId(session.id)}
          onEditAgenda={() => setPrepSessionId(session.id)}
          onInvite={() => setInviteSessionId(session.id)}
          coachName={coachName}
          doctorName={doctorName}
          onDelete={async () => {
            await supabase.from('coaching_session_selections').delete().eq('session_id', session.id);
            await supabase.from('coaching_meeting_records').delete().eq('session_id', session.id);
            const { error } = await supabase.from('coaching_sessions').delete().eq('id', session.id);
            if (error) {
              toast({ title: 'Error', description: error.message, variant: 'destructive' });
            } else {
              queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
              toast({ title: 'Session deleted' });
            }
          }}
        />
      ))}

      {/* Scheduling Invite Composer */}
      <SchedulingInviteComposer
        open={!!inviteSessionId}
        onOpenChange={(open) => { if (!open) setInviteSessionId(null); }}
        doctorName={doctorName}
        doctorEmail={doctorEmail}
        doctorStaffId={doctorStaffId}
        sessionId={inviteSessionId ?? undefined}
        onSuccess={handleInviteSuccess}
      />
    </div>
  );
}

function SessionCard({
  session,
  expanded,
  onToggle,
  onCapture,
  onBuildAgenda,
  onEditAgenda,
  onInvite,
  onDelete,
  coachName,
  doctorName,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  onCapture: () => void;
  onBuildAgenda: () => void;
  onEditAgenda: () => void;
  onInvite: () => void;
  onDelete: () => void;
  coachName: string;
  doctorName: string;
}) {
  const statusInfo = statusLabels[session.status] || { label: session.status, className: 'bg-muted text-muted-foreground' };
  const typeLabel = session.session_type === 'baseline_review'
    ? 'Baseline Review'
    : `Check-in ${session.sequence_number - 1}`;

  const expandableStatus = isExpandable(session.status);
  const showCapture = canCaptureStatus(session.status);
  const showBuildAgenda = canBuildAgenda(session.status);
  const showInvite = canInvite(session.status);

  const { data: meetingSummary } = useQuery({
    queryKey: ['meeting-summary', session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('experiments, doctor_revision_note')
        .eq('session_id', session.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: ['meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(session.status),
  });

  const experimentCount = ((meetingSummary?.experiments as any[] | null) || []).length;

  // Build subtitle
  let subtitle: string | null = null;
  if (session.status === 'scheduling_invite_sent') {
    subtitle = 'Awaiting doctor\'s response';
  } else if (session.status === 'doctor_prep_submitted') {
    subtitle = 'Doctor submitted prep';
  } else if ((session.status === 'meeting_pending' || session.status === 'doctor_confirmed') && meetingSummary) {
    subtitle = experimentCount > 0 ? `${experimentCount} action step${experimentCount !== 1 ? 's' : ''}` : null;
  } else if (session.status === 'doctor_revision_requested') {
    subtitle = 'Doctor left a note';
  }

  const { data: sessionFull } = useQuery({
    queryKey: ['coaching-session', session.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('coaching_sessions').select('*').eq('id', session.id).single();
      if (error) throw error;
      return data;
    },
    enabled: expanded,
  });

  const { data: selections } = useQuery({
    queryKey: ['session-selections-all', session.id],
    queryFn: async () => {
      const { data: sels, error: selErr } = await supabase
        .from('coaching_session_selections')
        .select('action_id, selected_by, display_order')
        .eq('session_id', session.id);
      if (selErr) throw selErr;
      if (!sels?.length) return [];

      const actionIds = sels.map(s => s.action_id);
      const { data: moves, error: movErr } = await supabase
        .from('pro_moves')
        .select(`action_id, action_statement, competencies!fk_pro_moves_competency_id (name, domains!competencies_domain_id_fkey (domain_name))`)
        .in('action_id', actionIds);
      if (movErr) throw movErr;

      const moveMap = (moves || []).reduce((acc: any, m: any) => { acc[m.action_id] = m; return acc; }, {});
      return sels.map(s => ({ ...s, pro_moves: moveMap[s.action_id] || null }));
    },
    enabled: expanded,
  });

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
    enabled: expanded && ['meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(session.status),
  });

  const experiments = (meetingRecord?.experiments as any[] | null) || [];

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <Card className="transition-colors">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 cursor-pointer hover:bg-muted/30">
            <div className="flex items-center gap-3">
              {expandableStatus && (
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
              )}
              <div>
                <CardTitle className="text-base">{typeLabel}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {session.scheduled_at
                    ? `${['meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(session.status) ? 'Met on ' : ''}${formatInTimeZone(new Date(session.scheduled_at), Intl.DateTimeFormat().resolvedOptions().timeZone, "EEEE, MMMM d, yyyy 'at' h:mm a zzz")}`
                    : (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {session.status === 'scheduled'
                          ? 'Draft — build agenda to proceed'
                          : session.status === 'doctor_prep_submitted'
                          ? 'Ready for meeting'
                          : session.status === 'director_prep_ready'
                          ? 'Send invite to schedule'
                          : 'Awaiting scheduling'}
                      </span>
                    )
                  }
                </p>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${statusInfo.className} hover:${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
              {showBuildAgenda && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={(e) => { e.stopPropagation(); onBuildAgenda(); }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Build Agenda
                </Button>
              )}
              {showInvite && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onEditAgenda(); }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Edit Agenda
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onInvite(); }}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Invite to Schedule
                  </Button>
                </>
              )}
              {showCapture && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={(e) => { e.stopPropagation(); onCapture(); }}
                >
                  <ClipboardEdit className="h-3.5 w-3.5" />
                  Start Meeting
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {typeLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this session and all its prep data, selections, and meeting records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {sessionFull && selections && selections.length > 0 ? (
              <CombinedPrepView
                session={sessionFull}
                selections={selections as any}
                coachName={coachName}
                doctorName={doctorName}
              />
            ) : (
              !meetingRecord && (
                <p className="text-sm text-muted-foreground italic py-2">No prep details yet for this session.</p>
              )
            )}

            {meetingRecord && (
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  Meeting Record
                </h4>

                {meetingRecord.calibration_confirmed && (
                  <Badge variant="secondary" className="text-xs">Calibration Confirmed</Badge>
                )}

                <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                  {meetingRecord.summary}
                </div>

                {experiments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FlaskConical className="h-3.5 w-3.5" />
                      Action Steps
                    </p>
                    <div className="space-y-2">
                      {experiments.map((exp: any, i: number) => (
                        <div key={i} className="p-2 rounded-md bg-muted/30 border">
                          <p className="text-sm font-medium">{exp.title}</p>
                          {exp.description && <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {meetingRecord.doctor_revision_note && (
                  <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Revision Requested</p>
                    <p className="text-sm">{meetingRecord.doctor_revision_note}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
