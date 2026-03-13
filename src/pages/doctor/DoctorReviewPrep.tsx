import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { drName } from '@/lib/doctorDisplayName';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DomainBadge } from '@/components/ui/domain-badge';
import { ArrowLeft, Send, Calendar, X, CheckCircle2, Circle, Clock, ExternalLink, Filter } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

type ProgressStatus = 'going_well' | 'working_on_it' | 'not_started';
interface ProgressEntry { title: string; status: ProgressStatus; note: string; }

const PROGRESS_OPTIONS: { value: ProgressStatus; label: string; icon: typeof CheckCircle2; color: string }[] = [
  { value: 'going_well', label: 'Going well', icon: CheckCircle2, color: 'text-emerald-600' },
  { value: 'working_on_it', label: 'Working on it', icon: Clock, color: 'text-amber-600' },
  { value: 'not_started', label: "Haven't started", icon: Circle, color: 'text-muted-foreground' },
];

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MEETING_FMT = "EEEE, MMMM d 'at' h:mm a zzz";
import { getDomainColorRaw } from '@/lib/domainColors';
import { CombinedPrepView } from '@/components/clinical/CombinedPrepView';
import { MeetingConfirmationCard } from '@/components/doctor/MeetingConfirmationCard';

const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

const SCORE_COLORS: Record<number, string> = {
  4: 'bg-emerald-500',
  3: 'bg-blue-500',
  2: 'bg-amber-500',
  1: 'bg-orange-500',
};

function ScoreCircle({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score == null) return null;
  if (score === 0) return (
    <div className="flex flex-col items-center gap-0.5">
      {label && <span className="text-[9px] text-muted-foreground">{label}</span>}
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold bg-muted text-muted-foreground">N/A</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && <span className="text-[9px] text-muted-foreground">{label}</span>}
      <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold text-white ${SCORE_COLORS[score] || 'bg-muted'}`}>
        {score}
      </span>
    </div>
  );
}

export default function DoctorReviewPrep() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { data: staff } = useStaffProfile();
  const queryClient = useQueryClient();
  const [selectedActions, setSelectedActions] = useState<number[]>([]);
  const [doctorNote, setDoctorNote] = useState('');
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [hasScheduled, setHasScheduled] = useState(false);
  const [lowSelfFilter, setLowSelfFilter] = useState(false);

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
      const { data: sels, error: selErr } = await supabase
        .from('coaching_session_selections')
        .select('action_id, selected_by, display_order')
        .eq('session_id', sessionId);
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


  // Fetch prior session experiments for progress notes (follow-ups only)
  const { data: priorExperiments } = useQuery({
    queryKey: ['prior-experiments-doctor', sessionId, session?.doctor_staff_id],
    queryFn: async () => {
      if (!session?.doctor_staff_id || !session?.sequence_number || session.sequence_number <= 1) return [];
      const { data: priorSessions } = await supabase
        .from('coaching_sessions')
        .select('id')
        .eq('doctor_staff_id', session.doctor_staff_id)
        .in('status', ['doctor_confirmed', 'meeting_pending'])
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

  // Initialize progress entries from prior experiments
  const isFollowUp = (session?.sequence_number ?? 0) > 1;
  const hasPriorSteps = (priorExperiments?.length ?? 0) > 0;

  // Seed progress entries once when priorExperiments loads
  useState(() => {
    // This runs once on mount — we update via effect below
  });

  // Use effect-like pattern: if priorExperiments changed and entries empty, seed them
  if (hasPriorSteps && progressEntries.length === 0 && priorExperiments) {
    const seeded = priorExperiments.map((exp: any) => ({
      title: exp.title || '',
      status: 'not_started' as ProgressStatus,
      note: '',
    }));
    // Batched set via timeout to avoid render-during-render
    setTimeout(() => setProgressEntries(seeded), 0);
  }

  // Fetch coach info (name only — scheduling link comes from session.meeting_link)
  const { data: coachInfo } = useQuery({
    queryKey: ['coach-info', session?.coach_staff_id],
    queryFn: async () => {
      if (!session?.coach_staff_id) return { name: 'Your Coach' };
      const { data } = await supabase.from('staff').select('name').eq('id', session.coach_staff_id).single();
      return { name: data?.name || 'Your Coach' };
    },
    enabled: !!session?.coach_staff_id,
  });

  const coachName = coachInfo?.name || 'Your Coach';
  // Use meeting_link from session (set when invite was sent) — avoids RLS issues
  const rawLink = session?.meeting_link;
  const coachSchedulingLink = rawLink && !/^https?:\/\//i.test(rawLink) ? `https://${rawLink}` : rawLink;

  const coachSelections = allSelections?.filter(s => s.selected_by === 'coach') || [];
  const coachActionIds = coachSelections.map(s => s.action_id);

  const isReadOnly = session?.status === 'doctor_prep_submitted' || session?.status === 'doctor_confirmed';
  const isSchedulingInviteSent = session?.status === 'scheduling_invite_sent';
  const isMeetingPending = session?.status === 'meeting_pending';

  const toggleAction = (actionId: number) => {
    setSelectedActions(prev => {
      if (prev.includes(actionId)) return prev.filter(id => id !== actionId);
      if (prev.length >= 2) {
        toast({ title: 'Maximum 2', description: 'Deselect one before adding another.', variant: 'destructive' });
        return prev;
      }
      return [...prev, actionId];
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (selectedActions.length === 0) throw new Error('Select at least one Pro Move.');

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

      // Serialize progress + freeNote into doctor_note as JSON
      const notePayload = (isFollowUp && progressEntries.length > 0)
        ? JSON.stringify({ progress: progressEntries, freeNote: doctorNote || '' })
        : (doctorNote || null);

      const { error: sessErr } = await supabase
        .from('coaching_sessions')
        .update({
          doctor_note: notePayload,
          status: 'doctor_prep_submitted',
        })
        .eq('id', sessionId);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-selections-all', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['my-coaching-sessions'] });
      toast({ title: 'Prep submitted!', description: 'You\'re all set for the meeting.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error submitting prep', description: err.message, variant: 'destructive' });
    },
  });

  if (sessionLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
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

  const doctorPrepAccessibleStatuses = ['scheduling_invite_sent', 'doctor_prep_submitted', 'meeting_pending', 'doctor_confirmed', 'doctor_revision_requested'];
  if (!doctorPrepAccessibleStatuses.includes(session.status)) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link to="/doctor">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h2 className="text-xl font-bold">Meeting Prep Not Available Yet</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your clinical director is still preparing your meeting. You'll get access after your scheduling invite is sent.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Meeting pending — show confirmation card
  if (isMeetingPending) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link to="/doctor">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h2 className="text-xl font-bold">Review Meeting Summary</h2>
            <Badge className="bg-purple-100 text-purple-800 mt-1">Awaiting Your Confirmation</Badge>
          </div>
        </div>
        <MeetingConfirmationCard sessionId={sessionId!} onConfirmed={() => navigate('/doctor')} />
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
            <Badge className="bg-emerald-100 text-emerald-800 mt-1">✓ Prep Complete</Badge>
          </div>
        </div>
        <CombinedPrepView
          session={session}
          selections={(allSelections || []) as any}
          coachName={coachName || 'Your Coach'}
          doctorName={drName(staff?.name)}
        />
      </div>
    );
  }

  // Group baseline items by domain, applying optional low-self filter
  const filteredBaselineItems = lowSelfFilter
    ? (baselineItems || []).filter(item => item.self_score != null && item.self_score > 0 && item.self_score <= 2)
    : (baselineItems || []);

  const groupedItems = filteredBaselineItems.reduce((acc, item) => {
    const pm = item.pro_moves as any;
    const domainName = pm?.competencies?.domains?.domain_name || 'Other';
    if (!acc[domainName]) acc[domainName] = [];
    acc[domainName].push(item);
    return acc;
  }, {} as Record<string, typeof baselineItems>);

  const availableDomains = DOMAIN_ORDER.filter(d => groupedItems[d]?.length);

  // Get full item data for selected actions
  const selectedItemData = (baselineItems || []).filter(item => selectedActions.includes(item.action_id));

  const meetingTypeLabel = session.session_type === 'baseline_review' ? 'Baseline Review' : `Follow-up`;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/doctor">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h2 className="text-xl font-bold">Prepare for Your {meetingTypeLabel}</h2>
          {session.scheduled_at ? (
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {formatInTimeZone(new Date(session.scheduled_at), LOCAL_TZ, MEETING_FMT)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Complete your prep, then schedule when ready.</p>
          )}
        </div>
      </div>

      {/* Step 0: Prior Action Steps Progress (follow-ups only) */}
      {isFollowUp && hasPriorSteps && (
        <>
          <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold">✓</div>
                <CardTitle className="text-base">How are your action steps going?</CardTitle>
              </div>
              <CardDescription>Quick update on the goals from your last session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {progressEntries.map((entry, i) => (
                <div key={i} className="space-y-2 p-3 rounded-lg border bg-background">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <div className="flex gap-2 flex-wrap">
                    {PROGRESS_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const isActive = entry.status === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          variant={isActive ? 'default' : 'outline'}
                          size="sm"
                          className={`gap-1.5 text-xs ${isActive ? '' : opt.color}`}
                          onClick={() => {
                            setProgressEntries(prev => prev.map((e, j) => j === i ? { ...e, status: opt.value } : e));
                          }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>
                  <Textarea
                    placeholder="Any quick notes? (optional)"
                    value={entry.note}
                    onChange={(e) => {
                      setProgressEntries(prev => prev.map((pe, j) => j === i ? { ...pe, note: e.target.value } : pe));
                    }}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          <Separator />
        </>
      )}

      {/* Step 1: Meeting Agenda from Coach */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
            <CardTitle className="text-base">Meeting Agenda</CardTitle>
          </div>
          <CardDescription>Here's what {coachName} has planned for your conversation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {coachSelections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Focus Areas
              </p>
              <div className="space-y-2">
                {coachSelections.map(sel => (
                  <div key={sel.action_id} className="flex items-center gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/10">
                    <DomainBadge domain={(sel as any).pro_moves?.competencies?.domains?.domain_name} />
                    <span className="text-sm font-medium">{(sel as any).pro_moves?.action_statement || `Action #${sel.action_id}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.coach_note && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Agenda Notes</p>
              <div
                className="text-sm bg-muted/30 rounded-md p-3 prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(session.coach_note) }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Step 2: Doctor picks Pro Moves — domain tabbed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
            <CardTitle className="text-base">Your Focus Areas</CardTitle>
          </div>
          <CardDescription>
            <strong>Choose up to 2 Pro Moves</strong> that you'd like to focus on during the meeting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant={lowSelfFilter ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setLowSelfFilter(prev => !prev)}
            >
              <Filter className="h-3 w-3" />
              Low Self (1–2)
            </Button>
          </div>
          {availableDomains.length > 0 ? (
            <Tabs defaultValue={availableDomains[0]} key={availableDomains.join(',')}>

              <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0 mb-3">
                {availableDomains.map(domain => (
                  <TabsTrigger
                    key={domain}
                    value={domain}
                    className="text-xs font-medium data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-foreground/20 rounded-full px-4 py-2 border-2 transition-all cursor-pointer hover:opacity-90"
                    style={{
                      backgroundColor: `hsl(${getDomainColorRaw(domain)} / 0.35)`,
                      borderColor: `hsl(${getDomainColorRaw(domain)} / 0.6)`,
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    {domain}
                  </TabsTrigger>
                ))}
              </TabsList>

              {availableDomains.map(domain => (
                <TabsContent key={domain} value={domain} className="mt-0">
                  <div
                    className="rounded-lg border p-3 space-y-1"
                    style={{ backgroundColor: `hsl(${getDomainColorRaw(domain)} / 0.06)` }}
                  >
                    <div className="flex items-center gap-3 px-2.5 pb-1 mb-1 border-b border-border/50">
                      <div className="w-4" />
                      <div className="flex-1 min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Pro Move</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-5 text-center">Self</p>
                      </div>
                    </div>
                    {(groupedItems[domain] || []).map(item => {
                      const pm = item.pro_moves as any;
                      const isSelected = selectedActions.includes(item.action_id);
                      const isSuggested = coachActionIds.includes(item.action_id);
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium leading-snug">{pm?.action_statement || `Action #${item.action_id}`}</p>
                              {isSuggested && (
                                <Badge className="bg-amber-100 text-amber-800 text-2xs px-1.5 py-0">{coachName}'s pick</Badge>
                              )}
                            </div>
                            {pm?.competencies?.name && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{pm.competencies.name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <ScoreCircle score={item.self_score} />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : lowSelfFilter ? (
            <p className="text-sm text-muted-foreground">No Pro Moves with a self score of 1–2. Try removing the filter.</p>
          ) : (
            <p className="text-sm text-muted-foreground">No baseline items found.</p>
          )}
        </CardContent>
      </Card>

      {/* Selected "Your Picks" — snatched out */}
      <Card className={selectedActions.length > 0 ? 'border-primary/30 bg-primary/5' : 'border-dashed'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Your Picks ({selectedActions.length}/2)</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select 1–2 Pro Moves above to discuss at the meeting.</p>
          ) : (
            <div className="space-y-2">
              {selectedItemData.map(item => {
                const pm = item.pro_moves as any;
                const domainName = pm?.competencies?.domains?.domain_name;
                return (
                  <div key={item.action_id} className="flex items-center gap-2 p-2.5 rounded-md bg-background border">
                    <DomainBadge domain={domainName} />
                    <span className="text-sm font-medium flex-1">{pm?.action_statement}</span>
                    <ScoreCircle score={item.self_score} label="Self" />
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

      <Separator />

      {/* Step 3: Doctor's comments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
            <CardTitle className="text-base">Your Thoughts</CardTitle>
          </div>
          <CardDescription>
            Any comments, concerns, or questions you'd like to cover at the meeting? (Optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={doctorNote}
            onChange={(e) => setDoctorNote(e.target.value)}
            placeholder="Anything on your mind — wins, challenges, questions for discussion..."
            rows={4}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* Step 4: Scheduling confirmation (only when invite was sent but no date yet) */}
      {isSchedulingInviteSent && (
        <>
          <Separator />
          <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-800/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">Have You Scheduled Your Meeting?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={hasScheduled}
                  onCheckedChange={(checked) => setHasScheduled(checked === true)}
                />
                <span className="text-sm font-medium">Yes, I've already scheduled my meeting</span>
              </label>
              {!hasScheduled && (
                <div className="p-3 rounded-lg bg-background border">
                  {coachSchedulingLink ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        If not, click below to find a time with {coachName}:
                      </p>
                      <a
                        href={coachSchedulingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Schedule with {coachName}
                      </a>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Please reach out to {coachName} to schedule your meeting before submitting.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Submit */}
      <Button
        className="w-full gap-2"
        onClick={() => submitMutation.mutate()}
        disabled={selectedActions.length === 0 || submitMutation.isPending || (isSchedulingInviteSent && !hasScheduled)}
        size="lg"
      >
        <Send className="h-4 w-4" />
        {submitMutation.isPending ? 'Submitting...' : 'Submit My Prep'}
      </Button>
      <p className="text-xs text-muted-foreground text-center pb-4">
        This locks your selections and creates a shared meeting agenda for both of you.
      </p>
    </div>
  );
}
