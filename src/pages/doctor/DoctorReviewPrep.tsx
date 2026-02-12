import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';

export default function DoctorReviewPrep() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: staff } = useStaffProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedActions, setSelectedActions] = useState<number[]>([]);
  const [doctorNote, setDoctorNote] = useState('');

  // Fetch session
  const { data: session, isLoading: sessionLoading } = useQuery({
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
    enabled: !!sessionId,
  });

  // Fetch all selections
  const { data: allSelections } = useQuery({
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
              domains!competencies_domain_id_fkey (
                domain_name
              )
            )
          )
        `)
        .eq('session_id', sessionId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  // Fetch doctor's baseline items for the picker
  const { data: baselineItems } = useQuery({
    queryKey: ['doctor-baseline-items-for-prep', session?.doctor_staff_id],
    queryFn: async () => {
      if (!session?.doctor_staff_id) return [];
      const { data: assessment } = await supabase
        .from('doctor_baseline_assessments')
        .select('id')
        .eq('doctor_staff_id', session.doctor_staff_id)
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
    enabled: !!session?.doctor_staff_id,
  });

  // Fetch coach + doctor names
  const { data: coachName } = useQuery({
    queryKey: ['staff-name', session?.coach_staff_id],
    queryFn: async () => {
      if (!session?.coach_staff_id) return 'Alex';
      const { data } = await supabase.from('staff').select('name').eq('id', session.coach_staff_id).single();
      return data?.name || 'Alex';
    },
    enabled: !!session?.coach_staff_id,
  });

  const coachSelections = allSelections?.filter(s => s.selected_by === 'coach') || [];
  const coachActionIds = coachSelections.map(s => s.action_id);

  const isReadOnly = session?.status === 'doctor_prep_submitted' || session?.status === 'doctor_confirmed' || session?.status === 'meeting_pending';

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

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (selectedActions.length === 0) throw new Error('Select at least one discussion topic.');

      // Insert doctor selections
      const selections = selectedActions.map((actionId, i) => ({
        session_id: sessionId!,
        action_id: actionId,
        selected_by: 'doctor' as const,
        display_order: (i + 1) as 1 | 2,
      }));

      const { error: selErr } = await supabase
        .from('coaching_session_selections')
        .insert(selections);
      if (selErr) throw selErr;

      // Update session with doctor note and status
      const { error: sessErr } = await supabase
        .from('coaching_sessions')
        .update({
          doctor_note: doctorNote || null,
          status: 'doctor_prep_submitted',
        })
        .eq('id', sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-selections-all', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['my-coaching-sessions'] });
      toast({ title: 'Prep submitted', description: 'Both sides are now ready for the meeting.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error submitting prep', description: err.message, variant: 'destructive' });
    },
  });

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Session not found</p>
        <Link to="/doctor"><Button variant="link">Back to Home</Button></Link>
      </div>
    );
  }

  // Read-only combined view for submitted/confirmed states
  if (isReadOnly) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link to="/doctor">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h2 className="text-xl font-bold">Meeting Prep</h2>
            <Badge className="bg-emerald-100 text-emerald-800 mt-1">Prep Complete</Badge>
          </div>
        </div>
        <CombinedPrepView
          session={session}
          selections={(allSelections || []) as any}
          coachName={coachName || 'Alex'}
          doctorName={staff?.name || 'Doctor'}
        />
      </div>
    );
  }

  // Doctor prep form
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
        <Link to="/doctor">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h2 className="text-xl font-bold">Baseline Review Prep</h2>
          <p className="text-sm text-muted-foreground">
            {format(new Date(session.scheduled_at), 'EEEE, MMMM d \'at\' h:mm a')}
          </p>
        </div>
      </div>

      {/* Coach's Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">From {coachName || 'Alex'}</CardTitle>
          <CardDescription>Read through these notes before adding your own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {coachSelections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Discussion Topics</p>
              <div className="space-y-2">
                {coachSelections.map(sel => (
                  <div key={sel.action_id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Badge variant="outline" className="text-xs">
                      {(sel as any).pro_moves?.competencies?.domains?.domain_name || '—'}
                    </Badge>
                    <span className="text-sm">{(sel as any).pro_moves?.action_statement || `Action #${sel.action_id}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.coach_note && (
            <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3">
              {session.coach_note}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doctor ProMove Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Discussion Topics</CardTitle>
          <CardDescription>
            Select 1–2 Pro Moves you'd like to discuss ({selectedActions.length}/2 selected)
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
                  const isSuggested = coachActionIds.includes(item.action_id);
                  return (
                    <label
                      key={item.action_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : isSuggested ? 'border-amber-300 bg-amber-50/50' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAction(item.action_id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{pm?.action_statement || `Action #${item.action_id}`}</p>
                          {isSuggested && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">Suggested</Badge>
                          )}
                        </div>
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

      {/* Doctor Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Notes & Questions</CardTitle>
          <CardDescription>
            Anything you'd like to discuss, ask about, or clarify during the meeting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={doctorNote}
            onChange={(e) => setDoctorNote(e.target.value)}
            placeholder="Share your thoughts, questions, or areas you'd like to explore..."
            rows={4}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        className="w-full gap-2"
        onClick={() => submitMutation.mutate()}
        disabled={selectedActions.length === 0 || submitMutation.isPending}
      >
        <Send className="h-4 w-4" />
        {submitMutation.isPending ? 'Submitting...' : 'Submit Prep'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Submitting locks your prep and creates a shared meeting agenda.
      </p>
    </div>
  );
}
