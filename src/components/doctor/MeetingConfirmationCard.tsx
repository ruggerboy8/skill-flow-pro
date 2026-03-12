import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Calendar, FlaskConical, FileText, ChevronDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { cn } from '@/lib/utils';

interface Props {
  sessionId: string;
  onConfirmed?: () => void;
}

export function MeetingConfirmationCard({ sessionId, onConfirmed }: Props) {
  const queryClient = useQueryClient();
  const [agendaOpen, setAgendaOpen] = useState(false);

  const { data: session } = useQuery({
    queryKey: ['coaching-session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: meetingRecord } = useQuery({
    queryKey: ['meeting-record', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_meeting_records')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
  });

  const { data: selections } = useQuery({
    queryKey: ['session-selections', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_session_selections')
        .select('action_id, selected_by, pro_moves(action_statement, competencies(name, domains(domain_name)))')
        .eq('session_id', sessionId)
        .order('display_order');
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error: recErr } = await supabase
        .from('coaching_meeting_records')
        .update({ doctor_confirmed_at: new Date().toISOString() })
        .eq('session_id', sessionId);
      if (recErr) throw recErr;

      const { error: sessErr } = await supabase
        .from('coaching_sessions')
        .update({ status: 'doctor_confirmed' })
        .eq('id', sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-record', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['my-coaching-sessions'] });
      toast({ title: 'All set!', description: 'You've confirmed receipt of your meeting summary.' });
      onConfirmed?.();
    },
    onError: (err: any) => {
      toast({ title: 'Something went wrong', description: err.message, variant: 'destructive' });
    },
  });

  if (!session || !meetingRecord) return null;

  const experiments = (meetingRecord.experiments as any[] | null) || [];
  const isConfirmed = session.status === 'doctor_confirmed';

  return (
    <div className="space-y-4">
      {/* Header context */}
      <div>
        <h2 className="text-lg font-semibold">Review & Confirm</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Please review the meeting summary and action steps below, then confirm receipt.
        </p>
      </div>

      {/* Meeting Info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{format(new Date(session.scheduled_at), 'MMMM d, yyyy')}</span>
        <span>·</span>
        <span>
          {session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${session.sequence_number - 1}`}
        </span>
      </div>

      {/* Meeting Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{meetingRecord.summary}</p>
        </CardContent>
      </Card>

      {/* Action Steps */}
      {experiments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Action Steps</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {experiments.map((exp: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-sm font-medium">{exp.title}</p>
                {exp.description && (
                  <p className="text-sm text-muted-foreground mt-1">{exp.description}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* View Meeting Agenda (collapsible) */}
      <Collapsible open={agendaOpen} onOpenChange={setAgendaOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-xs w-full">
            <FileText className="h-3.5 w-3.5" />
            View Meeting Agenda
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", agendaOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Card>
            <CardContent className="pt-4">
              <CombinedPrepView
                session={session as any}
                selections={(selections || []) as any}
                doctorName="You"
              />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Confirm / Confirmed */}
      {isConfirmed ? (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium">Confirmed</p>
              <p className="text-xs text-muted-foreground">
                {meetingRecord.doctor_confirmed_at
                  ? `Confirmed on ${format(new Date(meetingRecord.doctor_confirmed_at), 'MMMM d, yyyy')}`
                  : 'This record has been confirmed.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          className="w-full gap-2"
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
        >
          <CheckCircle2 className="h-4 w-4" />
          {confirmMutation.isPending ? 'Confirming...' : 'Confirm Receipt'}
        </Button>
      )}
    </div>
  );
}
