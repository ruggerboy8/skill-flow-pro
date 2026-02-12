import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, MessageSquareWarning, Calendar, FlaskConical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Props {
  sessionId: string;
  onConfirmed?: () => void;
}

export function MeetingConfirmationCard({ sessionId, onConfirmed }: Props) {
  const queryClient = useQueryClient();
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');

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

  const { data: coachName } = useQuery({
    queryKey: ['staff-name', session?.coach_staff_id],
    queryFn: async () => {
      if (!session?.coach_staff_id) return 'Alex';
      const { data } = await supabase.from('staff').select('name').eq('id', session.coach_staff_id).single();
      return data?.name || 'Alex';
    },
    enabled: !!session?.coach_staff_id,
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
      toast({ title: 'Meeting confirmed', description: 'The record is now locked.' });
      onConfirmed?.();
    },
    onError: (err: any) => {
      toast({ title: 'Error confirming', description: err.message, variant: 'destructive' });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      if (!revisionNote.trim()) throw new Error('Please explain what needs revision.');

      const { error: recErr } = await supabase
        .from('coaching_meeting_records')
        .update({ doctor_revision_note: revisionNote.trim() })
        .eq('session_id', sessionId);
      if (recErr) throw recErr;

      const { error: sessErr } = await supabase
        .from('coaching_sessions')
        .update({ status: 'doctor_revision_requested' })
        .eq('id', sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-record', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['my-coaching-sessions'] });
      toast({ title: 'Revision requested', description: `${coachName} will update the summary.` });
      setShowRevisionForm(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error requesting revision', description: err.message, variant: 'destructive' });
    },
  });

  if (!session || !meetingRecord) return null;

  const experiments = (meetingRecord.experiments as any[] | null) || [];
  const isConfirmed = session.status === 'doctor_confirmed';

  return (
    <div className="space-y-4">
      {/* Meeting Info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{format(new Date(session.scheduled_at), 'MMMM d, yyyy')}</span>
        <span>·</span>
        <span>
          {session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up ${session.sequence_number - 1}`}
        </span>
      </div>

      {/* Calibration */}
      {meetingRecord.calibration_confirmed && (
        <Badge className="bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Calibration Confirmed
        </Badge>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting Summary</CardTitle>
          <CardDescription>By {coachName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{meetingRecord.summary}</p>
        </CardContent>
      </Card>

      {/* Experiments */}
      {experiments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Experiments to Try</CardTitle>
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

      {/* Actions */}
      {isConfirmed ? (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium">Confirmed</p>
              <p className="text-xs text-muted-foreground">
                {meetingRecord.doctor_confirmed_at
                  ? `Confirmed on ${format(new Date(meetingRecord.doctor_confirmed_at), 'MMMM d, yyyy')}`
                  : 'This record has been confirmed and locked.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {showRevisionForm ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request a Revision</CardTitle>
                <CardDescription>Explain what needs to be changed or added.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="Describe what's inaccurate or missing..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1 gap-2"
                    onClick={() => revisionMutation.mutate()}
                    disabled={!revisionNote.trim() || revisionMutation.isPending}
                  >
                    <MessageSquareWarning className="h-4 w-4" />
                    {revisionMutation.isPending ? 'Sending...' : 'Send Revision Request'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowRevisionForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                {confirmMutation.isPending ? 'Confirming...' : 'Confirm Summary'}
              </Button>
              <Button variant="outline" onClick={() => setShowRevisionForm(true)}>
                Request Edit
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Confirming locks this record permanently.
          </p>
        </div>
      )}
    </div>
  );
}
