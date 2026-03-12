import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatInTimeZone } from 'date-fns-tz';
import { MessageSquare, ClipboardEdit, ChevronDown, FlaskConical, CheckCircle2, Clock, FileText, Mail, Plus, Trash2, ShieldAlert, UserCog, ShieldCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MeetingOutcomeCapture } from '@/components/clinical/MeetingOutcomeCapture';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { DirectorPrepComposer } from '@/components/clinical/DirectorPrepComposer';
import { SchedulingInviteComposer } from '@/components/clinical/SchedulingInviteComposer';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string | null;
  meeting_link?: string | null;
  coach_staff_id: string;
  coach_name?: string;
}

import { SESSION_STATUS_CONFIG, DEFAULT_STATUS } from '@/lib/coachingSessionStatus';

const statusLabels = SESSION_STATUS_CONFIG;

const canCaptureStatus = (status: string) =>
  ['scheduling_invite_sent', 'doctor_prep_submitted', 'doctor_revision_requested'].includes(status);

const canBuildAgenda = (status: string) => status === 'scheduled';

const canInvite = (status: string) => status === 'director_prep_ready';

const isExpandable = (status: string) =>
  ['director_prep_ready', 'scheduling_invite_sent', 'doctor_prep_submitted', 'meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(status);


interface CoachAssessmentInfo {
  id: string;
  status: string | null;
  updated_at: string | null;
  completed_at: string | null;
  coach_staff_id?: string;
}

interface Props {
  sessions: Session[];
  coachName?: string;
  doctorName?: string;
  doctorStaffId: string;
  doctorEmail: string;
  doctorBaselineComplete?: boolean;
  coachAssessment?: CoachAssessmentInfo | null;
  onStartCoachWizard?: () => void;
}

export function DoctorDetailThread({ sessions, coachName = 'Your Coach', doctorName = 'Doctor', doctorStaffId, doctorEmail, doctorBaselineComplete, coachAssessment, onStartCoachWizard }: Props) {
  const { data: myStaff } = useStaffProfile();
  const { isSuperAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [prepSessionId, setPrepSessionId] = useState<string | null>(null);
  const [inviteSessionId, setInviteSessionId] = useState<string | null>(null);

  // Fetch clinical directors for reassign dropdown (super admin only)
  const { data: clinicalDirectors } = useQuery({
    queryKey: ['clinical-directors-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .or('is_clinical_director.eq.true,is_super_admin.eq.true')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  // Add Check-in mutation
  const addCheckinMutation = useMutation({
    mutationFn: async () => {
      if (!myStaff?.id) throw new Error('Not authenticated');
      const isFirst = sessions.length === 0;
      const maxSeq = sessions.reduce((max, s) => Math.max(max, s.sequence_number), 0);
      const { error } = await supabase.from('coaching_sessions').insert({
        doctor_staff_id: doctorStaffId,
        coach_staff_id: myStaff.id,
        session_type: isFirst ? 'baseline_review' : 'follow_up',
        sequence_number: maxSeq + 1,
        status: 'scheduled',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Check-in added', description: 'New follow-up session created. Build your agenda to get started.' });
    },
    onError: (e: Error) => {
      const msg = (e as any)?.code === '23505'
        ? 'A session with this sequence already exists for this doctor.'
        : e.message;
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
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

  const sorted = [...sessions].sort((a, b) => b.sequence_number - a.sequence_number);

  return (
    <div className="space-y-3">

      {/* Coach Baseline Assessment CTA — show when doctor baseline is done but coach hasn't completed theirs */}
      {doctorBaselineComplete && coachAssessment?.status !== 'completed' && (
        <Button
          variant="outline"
          className="w-full h-12 gap-2 border-dashed text-base font-medium"
          onClick={onStartCoachWizard}
        >
          <ShieldCheck className="h-5 w-5" />
          {!coachAssessment ? 'Start Coach Baseline Assessment' : 'Continue Coach Baseline Assessment'}
        </Button>
      )}

      {/* Add session button — hide "Add Baseline Review" until coach assessment is completed */}
      {(sessions.length > 0 || coachAssessment?.status === 'completed') && (
        <Button
          variant="outline"
          className="w-full h-12 gap-2 border-dashed text-base font-medium"
          onClick={() => addCheckinMutation.mutate()}
          disabled={addCheckinMutation.isPending}
        >
          <Plus className="h-5 w-5" />
          {addCheckinMutation.isPending ? 'Creating…' : sessions.length === 0 ? 'Add Baseline Review' : 'Add Coaching Session'}
        </Button>
      )}

      {sessions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No coaching sessions yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a baseline review session above to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {sorted.map((session) => {
        const isOwner = session.coach_staff_id === myStaff?.id;
        return (
          <SessionCard
            key={session.id}
            session={session}
            isOwner={isOwner}
            isSuperAdmin={isSuperAdmin}
            clinicalDirectors={clinicalDirectors}
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
        );
      })}

      {/* Scheduling Invite Composer */}
      <SchedulingInviteComposer
        open={!!inviteSessionId}
        onOpenChange={(open) => { if (!open) setInviteSessionId(null); }}
        doctorName={doctorName}
        doctorEmail={doctorEmail}
        doctorStaffId={doctorStaffId}
        sessionId={inviteSessionId ?? undefined}
        sessionType={sessions.find(s => s.id === inviteSessionId)?.session_type}
        onSuccess={handleInviteSuccess}
      />
    </div>
  );
}

function SessionCard({
  session,
  isOwner,
  isSuperAdmin,
  clinicalDirectors,
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
  isOwner: boolean;
  isSuperAdmin: boolean;
  clinicalDirectors?: { id: string; name: string }[];
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const statusInfo = statusLabels[session.status] || { label: session.status, className: 'bg-muted text-muted-foreground' };
  const typeLabel = session.session_type === 'baseline_review'
    ? 'Baseline Review'
    : `Check-in ${session.sequence_number - 1}`;

  const expandableStatus = isExpandable(session.status);
  const showCapture = isOwner && canCaptureStatus(session.status);
  const showBuildAgenda = isOwner && canBuildAgenda(session.status);
  const showInvite = isOwner && canInvite(session.status);
  const showDelete = isOwner;

  const handleReassign = async (newCoachId: string) => {
    const { error } = await supabase
      .from('coaching_sessions')
      .update({ coach_staff_id: newCoachId })
      .eq('id', session.id);
    if (error) {
      toast({ title: 'Reassign failed', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Session reassigned' });
    }
  };

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
              {!isOwner && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {session.coach_name || 'Another coach'}
                </Badge>
              )}
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
              {showDelete && (
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
              )}
              {isSuperAdmin && !isOwner && clinicalDirectors && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Select onValueChange={handleReassign} value={session.coach_staff_id}>
                    <SelectTrigger className="h-8 w-8 p-0 border-none [&>svg]:hidden">
                      <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
                    </SelectTrigger>
                    <SelectContent>
                      {clinicalDirectors.map(cd => (
                        <SelectItem key={cd.id} value={cd.id}>{cd.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
