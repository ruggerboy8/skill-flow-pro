import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { MessageSquare, ClipboardEdit, ChevronDown, FlaskConical, CheckCircle2 } from 'lucide-react';
import { MeetingOutcomeCapture } from '@/components/clinical/MeetingOutcomeCapture';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';

interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  director_prep_ready: { label: 'Prep Sent', className: 'bg-amber-100 text-amber-800' },
  doctor_prep_submitted: { label: 'Prep Complete', className: 'bg-emerald-100 text-emerald-800' },
  meeting_pending: { label: 'Awaiting Confirmation', className: 'bg-purple-100 text-purple-800' },
  doctor_confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  doctor_revision_requested: { label: 'Revision Requested', className: 'bg-red-100 text-red-800' },
};

interface Props {
  sessions: Session[];
  coachName?: string;
  doctorName?: string;
}

export function DoctorDetailThread({ sessions, coachName = 'Alex', doctorName = 'Doctor' }: Props) {
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (captureSessionId) {
    return (
      <MeetingOutcomeCapture
        sessionId={captureSessionId}
        onBack={() => setCaptureSessionId(null)}
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No coaching sessions yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule a baseline review from the Overview tab to begin the coaching thread.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...sessions].sort((a, b) => a.sequence_number - b.sequence_number);
  const canCapture = (status: string) => ['doctor_prep_submitted', 'doctor_revision_requested'].includes(status);
  const isExpandable = (status: string) => ['director_prep_ready', 'doctor_prep_submitted', 'meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'].includes(status);

  return (
    <div className="space-y-3">
      {sorted.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          expanded={expandedId === session.id}
          onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
          canCapture={canCapture(session.status)}
          isExpandable={isExpandable(session.status)}
          onCapture={() => setCaptureSessionId(session.id)}
          coachName={coachName}
          doctorName={doctorName}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  expanded,
  onToggle,
  canCapture,
  isExpandable,
  onCapture,
  coachName,
  doctorName,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  canCapture: boolean;
  isExpandable: boolean;
  onCapture: () => void;
  coachName: string;
  doctorName: string;
}) {
  const statusInfo = statusLabels[session.status] || { label: session.status, className: 'bg-muted text-muted-foreground' };
  const typeLabel = session.session_type === 'baseline_review'
    ? 'Baseline Review'
    : `Follow-up ${session.sequence_number - 1}`;

  // Fetch full session + selections + meeting record when expanded
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
      const { data, error } = await supabase
        .from('coaching_session_selections')
        .select(`action_id, selected_by, display_order, pro_moves:action_id (action_statement, competencies!fk_pro_moves_competency_id (name, domains!competencies_domain_id_fkey (domain_name)))`)
        .eq('session_id', session.id);
      if (error) throw error;
      return data || [];
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
              {isExpandable && (
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
              )}
              <div>
                <CardTitle className="text-base">{typeLabel}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {formatInTimeZone(new Date(session.scheduled_at), Intl.DateTimeFormat().resolvedOptions().timeZone, "EEEE, MMMM d, yyyy 'at' h:mm a zzz")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCapture && (
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
              <Badge className={`${statusInfo.className} hover:${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Prep View */}
            {sessionFull && selections && selections.length > 0 && (
              <CombinedPrepView
                session={sessionFull}
                selections={selections as any}
                coachName={coachName}
                doctorName={doctorName}
              />
            )}

            {/* Meeting Record */}
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
                      Experiments
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
