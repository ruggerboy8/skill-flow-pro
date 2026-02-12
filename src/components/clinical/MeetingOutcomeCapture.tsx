import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DomainBadge } from '@/components/ui/domain-badge';
import { ArrowLeft, Plus, Trash2, Send, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Experiment {
  title: string;
  description: string;
}

interface Props {
  sessionId: string;
  onBack: () => void;
}

export function MeetingOutcomeCapture({ sessionId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState('');
  const [experiments, setExperiments] = useState<Experiment[]>([{ title: '', description: '' }]);

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

  const { data: selections } = useQuery({
    queryKey: ['session-selections-all', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_session_selections')
        .select(`
          action_id,
          selected_by,
          display_order,
          pro_moves:action_id (
            action_statement,
            competencies!fk_pro_moves_competency_id (
              name,
              domains!competencies_domain_id_fkey (domain_name)
            )
          )
        `)
        .eq('session_id', sessionId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: doctorName } = useQuery({
    queryKey: ['staff-name', session?.doctor_staff_id],
    queryFn: async () => {
      if (!session?.doctor_staff_id) return 'Doctor';
      const { data } = await supabase.from('staff').select('name').eq('id', session.doctor_staff_id).single();
      return data?.name || 'Doctor';
    },
    enabled: !!session?.doctor_staff_id,
  });

  const coachSelections = selections?.filter(s => s.selected_by === 'coach') || [];
  const doctorSelections = selections?.filter(s => s.selected_by === 'doctor') || [];

  // Find overlapping action_ids
  const coachIds = new Set(coachSelections.map(s => s.action_id));
  const doctorIds = new Set(doctorSelections.map(s => s.action_id));
  const overlapIds = new Set([...coachIds].filter(id => doctorIds.has(id)));

  const allTopics = [...coachSelections, ...doctorSelections.filter(s => !overlapIds.has(s.action_id))];

  const addExperiment = () => {
    if (experiments.length >= 3) {
      toast({ title: 'Maximum 3 experiments', variant: 'destructive' });
      return;
    }
    setExperiments(prev => [...prev, { title: '', description: '' }]);
  };

  const removeExperiment = (index: number) => {
    setExperiments(prev => prev.filter((_, i) => i !== index));
  };

  const updateExperiment = (index: number, field: keyof Experiment, value: string) => {
    setExperiments(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const validExperiments = experiments.filter(e => e.title.trim());
      if (!summary.trim()) throw new Error('Please add a meeting summary.');

      const { error: insertErr } = await supabase
        .from('coaching_meeting_records')
        .insert([{
          session_id: sessionId,
          calibration_confirmed: false,
          summary: summary.trim(),
          experiments: validExperiments as any,
          submitted_at: new Date().toISOString(),
        }]);
      if (insertErr) throw insertErr;

      const { error: statusErr } = await supabase
        .from('coaching_sessions')
        .update({ status: 'meeting_pending' })
        .eq('id', sessionId);
      if (statusErr) throw statusErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Meeting summary submitted', description: `${doctorName} can now review and confirm.` });
      onBack();
    },
    onError: (err: any) => {
      toast({ title: 'Error submitting', description: err.message, variant: 'destructive' });
    },
  });

  if (!session) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Capture Meeting Outcome</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
            <Calendar className="h-3.5 w-3.5" />
            {format(new Date(session.scheduled_at), 'MMMM d, yyyy')}
            <span>·</span>
            <span>{doctorName}</span>
          </div>
        </div>
      </div>

      {/* Agenda Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion Topics</CardTitle>
          <CardDescription>Topics from both sides' prep. Overlap is highlighted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allTopics.map(sel => {
            const pm = sel.pro_moves as any;
            const isOverlap = overlapIds.has(sel.action_id);
            return (
              <div
                key={`${sel.action_id}-${sel.selected_by}`}
                className={`flex items-center gap-2 p-2 rounded-md ${isOverlap ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}
              >
                <DomainBadge domain={pm?.competencies?.domains?.domain_name} />
                <span className="text-sm flex-1">{pm?.action_statement || `Action #${sel.action_id}`}</span>
                {isOverlap && <Badge className="bg-primary/20 text-primary text-xs">Both</Badge>}
                {!isOverlap && (
                  <Badge variant="secondary" className="text-xs">
                    {sel.selected_by === 'coach' ? 'Coach' : 'Doctor'}
                  </Badge>
                )}
              </div>
            );
          })}
          {allTopics.length === 0 && (
            <p className="text-sm text-muted-foreground">No discussion topics selected.</p>
          )}
        </CardContent>
      </Card>

      {/* Experiments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Experiments to Try</CardTitle>
              <CardDescription>Specific actions to practice before the next check-in.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addExperiment} disabled={experiments.length >= 3}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {experiments.map((exp, i) => (
            <div key={i} className="space-y-2 p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Experiment {i + 1}</p>
                {experiments.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeExperiment(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
              <Input
                placeholder="What to try (e.g., 'Use teach-back with every patient')"
                value={exp.title}
                onChange={(e) => updateExperiment(i, 'title', e.target.value)}
              />
              <Textarea
                placeholder="Details or context..."
                value={exp.description}
                onChange={(e) => updateExperiment(i, 'description', e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting Summary</CardTitle>
          <CardDescription>Key takeaways and agreements from the conversation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summarize the key discussion points, agreements, and next steps..."
            rows={5}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        className="w-full gap-2"
        onClick={() => submitMutation.mutate()}
        disabled={!summary.trim() || submitMutation.isPending}
      >
        <Send className="h-4 w-4" />
        {submitMutation.isPending ? 'Submitting...' : 'Submit for Doctor Review'}
      </Button>
      <p className="text-xs text-muted-foreground text-center pb-4">
        The doctor will be able to review and confirm this summary.
      </p>
    </div>
  );
}
