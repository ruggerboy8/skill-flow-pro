import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Props {
  sessionId: string;
  doctorStaffId: string;
  onBack: () => void;
}

export function DirectorPrepComposer({ sessionId, doctorStaffId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [selectedActions, setSelectedActions] = useState<number[]>([]);
  const [coachNote, setCoachNote] = useState('');
  const [published, setPublished] = useState(false);

  // Fetch session details
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

  // Fetch doctor's baseline items as the ProMove pool
  const { data: baselineItems } = useQuery({
    queryKey: ['doctor-baseline-items-for-prep', doctorStaffId],
    queryFn: async () => {
      // Get the doctor's baseline assessment
      const { data: assessment } = await supabase
        .from('doctor_baseline_assessments')
        .select('id')
        .eq('doctor_staff_id', doctorStaffId)
        .maybeSingle();

      if (!assessment?.id) return [];

      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select(`
          action_id,
          self_score,
          pro_moves!doctor_baseline_items_action_id_fkey (
            action_statement,
            competencies!fk_pro_moves_competency_id (
              name,
              domains!competencies_domain_id_fkey (
                domain_name,
                color_hex
              )
            )
          )
        `)
        .eq('assessment_id', assessment.id)
        .order('action_id');

      if (error) throw error;
      return data || [];
    },
    enabled: !!doctorStaffId,
  });

  // Fetch existing selections if editing
  const { data: existingSelections } = useQuery({
    queryKey: ['session-selections', sessionId, 'coach'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaching_session_selections')
        .select('action_id')
        .eq('session_id', sessionId)
        .eq('selected_by', 'coach');
      if (error) throw error;
      return data?.map(s => s.action_id) || [];
    },
  });

  // Initialize from existing data
  useState(() => {
    if (existingSelections?.length) {
      setSelectedActions(existingSelections);
    }
    if (session?.coach_note) {
      setCoachNote(session.coach_note);
    }
  });

  const toggleAction = (actionId: number) => {
    setSelectedActions(prev => {
      if (prev.includes(actionId)) return prev.filter(id => id !== actionId);
      if (prev.length >= 2) {
        toast({ title: 'Maximum 2 discussion topics', description: 'Deselect one before adding another.', variant: 'destructive' });
        return prev;
      }
      return [...prev, actionId];
    });
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (selectedActions.length === 0) throw new Error('Select at least one discussion topic.');

      // Delete existing selections and re-insert
      await supabase
        .from('coaching_session_selections')
        .delete()
        .eq('session_id', sessionId)
        .eq('selected_by', 'coach');

      const selections = selectedActions.map((actionId, i) => ({
        session_id: sessionId,
        action_id: actionId,
        selected_by: 'coach' as const,
        display_order: (i + 1) as 1 | 2,
      }));

      const { error: selErr } = await supabase
        .from('coaching_session_selections')
        .insert(selections);
      if (selErr) throw selErr;

      const { error: sessErr } = await supabase
        .from('coaching_sessions')
        .update({ coach_note: coachNote, status: 'director_prep_ready' })
        .eq('id', sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      setPublished(true);
      toast({ title: 'Prep published', description: 'The doctor can now see and complete their part.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error publishing prep', description: err.message, variant: 'destructive' });
    },
  });

  // Save draft without publishing
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      // Save selections
      await supabase
        .from('coaching_session_selections')
        .delete()
        .eq('session_id', sessionId)
        .eq('selected_by', 'coach');

      if (selectedActions.length > 0) {
        const selections = selectedActions.map((actionId, i) => ({
          session_id: sessionId,
          action_id: actionId,
          selected_by: 'coach' as const,
          display_order: (i + 1) as 1 | 2,
        }));
        await supabase.from('coaching_session_selections').insert(selections);
      }

      await supabase
        .from('coaching_sessions')
        .update({ coach_note: coachNote })
        .eq('id', sessionId);
    },
    onSuccess: () => {
      toast({ title: 'Draft saved' });
    },
  });

  if (published) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
            <h2 className="text-xl font-bold">Prep Published</h2>
            <p className="text-muted-foreground mt-2">
              The doctor can now see your notes and complete their prep before the meeting.
            </p>
            <Button variant="outline" className="mt-6" onClick={onBack}>
              Back to Doctor Detail
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group baseline items by domain
  const groupedItems = (baselineItems || []).reduce((acc, item) => {
    const pm = item.pro_moves as any;
    const domainName = pm?.competencies?.domains?.domain_name || 'Other';
    if (!acc[domainName]) acc[domainName] = [];
    acc[domainName].push(item);
    return acc;
  }, {} as Record<string, typeof baselineItems>);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Prepare Discussion Notes</h2>
          {session && (
            <p className="text-sm text-muted-foreground">
              Meeting: {format(new Date(session.scheduled_at), 'EEEE, MMMM d \'at\' h:mm a')}
            </p>
          )}
        </div>
      </div>

      {/* ProMove Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion Topics</CardTitle>
          <CardDescription>
            Select 1–2 Pro Moves to focus on during the meeting ({selectedActions.length}/2 selected)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(groupedItems).map(([domain, items]) => (
            <div key={domain}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{domain}</p>
              <div className="space-y-2">
                {(items || []).map((item) => {
                  const pm = item.pro_moves as any;
                  const isSelected = selectedActions.includes(item.action_id);
                  return (
                    <label
                      key={item.action_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAction(item.action_id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{pm?.action_statement || `Action #${item.action_id}`}</p>
                        {item.self_score != null && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            Self-score: {item.self_score}
                          </Badge>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Coach Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Discussion Notes</CardTitle>
          <CardDescription>
            What did you notice? What do you want to explore together?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            placeholder="Share your observations and what you'd like to discuss..."
            rows={6}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => saveDraftMutation.mutate()}
          disabled={saveDraftMutation.isPending}
        >
          Save Draft
        </Button>
        <Button
          className="flex-1 gap-2"
          onClick={() => publishMutation.mutate()}
          disabled={selectedActions.length === 0 || publishMutation.isPending}
        >
          <Send className="h-4 w-4" />
          {publishMutation.isPending ? 'Publishing...' : 'Ready for Doctor'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Publishing makes your notes visible to the doctor so they can complete their prep.
      </p>
    </div>
  );
}
