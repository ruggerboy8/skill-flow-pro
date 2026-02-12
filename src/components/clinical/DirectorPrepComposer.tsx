import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DomainBadge } from '@/components/ui/domain-badge';
import { ArrowLeft, Send, CheckCircle2, FlaskConical, Sparkles, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { getDomainColor, getDomainColorRaw } from '@/lib/domainColors';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Props {
  sessionId: string;
  doctorStaffId: string;
  onBack: () => void;
}

const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

const SCORE_COLORS: Record<number, string> = {
  4: 'bg-emerald-500',
  3: 'bg-blue-500',
  2: 'bg-amber-500',
  1: 'bg-orange-500',
};

function ScoreCircle({ score, label }: { score: number | null | undefined; label: string }) {
  if (score == null) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold text-white ${SCORE_COLORS[score] || 'bg-muted'}`}>
        {score}
      </span>
    </div>
  );
}

export function DirectorPrepComposer({ sessionId, doctorStaffId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [selectedActions, setSelectedActions] = useState<number[]>([]);
  const [coachNote, setCoachNote] = useState('');
  const [published, setPublished] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);

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
            description,
            competencies!fk_pro_moves_competency_id (
              name,
              friendly_description,
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

  // Fetch coach baseline items for coach scores
  const { data: coachItems } = useQuery({
    queryKey: ['coach-baseline-items-for-prep', doctorStaffId],
    queryFn: async () => {
      const { data: assessment } = await supabase
        .from('coach_baseline_assessments')
        .select('id')
        .eq('doctor_staff_id', doctorStaffId)
        .maybeSingle();

      if (!assessment?.id) return [];

      const { data, error } = await supabase
        .from('coach_baseline_items')
        .select('action_id, rating')
        .eq('assessment_id', assessment.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!doctorStaffId,
  });

  // Build a map of action_id -> coach rating
  const coachRatingMap = (coachItems || []).reduce((acc, item) => {
    acc[item.action_id] = item.rating;
    return acc;
  }, {} as Record<number, number | null>);

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

  // Fetch prior session experiments for follow-ups
  const { data: priorExperiments } = useQuery({
    queryKey: ['prior-experiments', sessionId, session?.doctor_staff_id],
    queryFn: async () => {
      if (!session?.doctor_staff_id || !session?.sequence_number || session.sequence_number <= 1) return [];
      const { data: priorSessions } = await supabase
        .from('coaching_sessions')
        .select('id')
        .eq('doctor_staff_id', session.doctor_staff_id)
        .eq('status', 'doctor_confirmed')
        .lt('sequence_number', session.sequence_number)
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (!priorSessions?.length) return [];

      const { data: record } = await supabase
        .from('coaching_meeting_records')
        .select('experiments')
        .eq('session_id', priorSessions[0].id)
        .maybeSingle();

      return (record?.experiments as any[] | null) || [];
    },
    enabled: !!session?.doctor_staff_id && (session?.sequence_number ?? 0) > 1,
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

  const handleMagicFormat = async () => {
    if (!coachNote.trim() || coachNote === '<p><br></p>') {
      toast({ title: 'Nothing to format', description: 'Write your agenda first.', variant: 'destructive' });
      return;
    }
    setIsFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('format-agenda', {
        body: { html: coachNote },
      });
      if (error) throw error;
      if (data?.formatted) {
        setCoachNote(data.formatted);
        toast({ title: 'Agenda formatted ✨' });
      }
    } catch (err: any) {
      toast({ title: 'Formatting failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsFormatting(false);
    }
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (selectedActions.length === 0) throw new Error('Select at least one discussion topic.');

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

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
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
              The doctor can now see your agenda and complete their prep before the meeting.
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

  const availableDomains = DOMAIN_ORDER.filter(d => groupedItems[d]?.length);

  // Get full item data for selected actions
  const selectedItemData = (baselineItems || []).filter(item => selectedActions.includes(item.action_id));

  const quillModules = {
    toolbar: [
      [{ header: [3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['clean'],
    ],
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Build Meeting Agenda</h2>
          {session && (
            <p className="text-sm text-muted-foreground">
              Meeting: {format(new Date(session.scheduled_at), 'EEEE, MMMM d \'at\' h:mm a')}
            </p>
          )}
        </div>
      </div>

      {/* Prior Experiments (for follow-ups) */}
      {priorExperiments && priorExperiments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Prior Experiments</CardTitle>
            </div>
            <CardDescription>From the previous session — discuss progress on these.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {priorExperiments.map((exp: any, i: number) => (
              <div key={i} className="p-2 rounded-md bg-muted/30 border">
                <p className="text-sm font-medium">{exp.title}</p>
                {exp.description && <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Domain-Tabbed ProMove Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion Topics</CardTitle>
          <CardDescription>
            Select 1–2 Pro Moves to focus on during the meeting
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableDomains.length > 0 ? (
            <Tabs defaultValue={availableDomains[0]}>
              <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0 mb-3">
                {availableDomains.map(domain => (
                  <TabsTrigger
                    key={domain}
                    value={domain}
                    className="text-xs data-[state=active]:shadow-sm rounded-full px-3 py-1.5 border transition-colors"
                    style={{
                      backgroundColor: `hsl(${getDomainColorRaw(domain)} / 0.15)`,
                      borderColor: `hsl(${getDomainColorRaw(domain)} / 0.3)`,
                    }}
                  >
                    {domain}
                    <span className="ml-1 text-muted-foreground">({(groupedItems[domain] || []).length})</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {availableDomains.map(domain => (
                <TabsContent key={domain} value={domain} className="mt-0">
                  <div
                    className="rounded-lg border p-3 space-y-1"
                    style={{ backgroundColor: `hsl(${getDomainColorRaw(domain)} / 0.06)` }}
                  >
                    {(groupedItems[domain] || []).map(item => {
                      const pm = item.pro_moves as any;
                      const competency = pm?.competencies;
                      const isSelected = selectedActions.includes(item.action_id);
                      const coachScore = coachRatingMap[item.action_id];
                      return (
                        <label
                          key={item.action_id}
                          className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-primary/10 ring-1 ring-primary/30'
                              : 'hover:bg-background/60'
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAction(item.action_id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{pm?.action_statement || `Action #${item.action_id}`}</p>
                            {competency?.name && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{competency.name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <ScoreCircle score={item.self_score} label="Self" />
                            <ScoreCircle score={coachScore} label="You" />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p className="text-sm text-muted-foreground">No baseline items found.</p>
          )}
        </CardContent>
      </Card>

      {/* Selected for Discussion — "snatched" items */}
      <Card className={selectedActions.length > 0 ? 'border-primary/30 bg-primary/5' : 'border-dashed'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Selected for Discussion ({selectedActions.length}/2)</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select 1–2 Pro Moves above to discuss at the meeting.</p>
          ) : (
            <div className="space-y-2">
              {selectedItemData.map(item => {
                const pm = item.pro_moves as any;
                const domainName = pm?.competencies?.domains?.domain_name;
                const coachScore = coachRatingMap[item.action_id];
                return (
                  <div key={item.action_id} className="flex items-center gap-2 p-2.5 rounded-md bg-background border">
                    <DomainBadge domain={domainName} />
                    <span className="text-sm font-medium flex-1">{pm?.action_statement}</span>
                    <ScoreCircle score={item.self_score} label="Self" />
                    <ScoreCircle score={coachScore} label="You" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => toggleAction(item.action_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meeting Agenda (Quill) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Meeting Agenda</CardTitle>
              <CardDescription>
                Build your agenda for the meeting. Use the magic button to auto-format.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleMagicFormat}
              disabled={isFormatting}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isFormatting ? 'Formatting...' : 'Magic Format'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ReactQuill
            value={coachNote}
            onChange={setCoachNote}
            modules={quillModules}
            placeholder="Type your meeting agenda here..."
            className="bg-background rounded-md"
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
        Publishing makes your agenda visible to the doctor so they can complete their prep.
      </p>
    </div>
  );
}
