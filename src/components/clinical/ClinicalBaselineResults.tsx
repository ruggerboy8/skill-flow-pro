import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';
import { ReflectionSection } from '@/components/doctor/ReflectionSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { ClipboardCheck, CheckCircle2, Clock, AlertCircle, ChevronDown, MessageSquare, ArrowDown, ArrowUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ClinicalBaselineResultsProps {
  staffId: string;
  assessmentId?: string;
  status?: string;
  completedAt?: string | null;
}

interface BaselineItem {
  action_id: number;
  self_score: number;
  self_note: string | null;
  action_statement: string;
  competency_name: string;
  domain_name: string;
  domain_id: number;
}

interface DomainData {
  [score: number]: BaselineItem[];
}

interface GroupedData {
  [domainName: string]: DomainData;
}

const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

const SCORE_COLORS: Record<number, { bg: string; border: string; text: string; activeBorder: string }> = {
  4: { bg: 'hsl(160 60% 95%)', border: 'hsl(160 50% 80%)', text: 'hsl(160 80% 25%)', activeBorder: 'hsl(160 60% 40%)' },
  3: { bg: 'hsl(210 80% 95%)', border: 'hsl(210 60% 80%)', text: 'hsl(210 80% 30%)', activeBorder: 'hsl(210 70% 45%)' },
  2: { bg: 'hsl(38 90% 95%)', border: 'hsl(38 70% 75%)', text: 'hsl(38 80% 30%)', activeBorder: 'hsl(38 80% 45%)' },
  1: { bg: 'hsl(0 70% 95%)', border: 'hsl(0 60% 80%)', text: 'hsl(0 70% 35%)', activeBorder: 'hsl(0 65% 45%)' },
};

const SCORE_LABELS: Record<number, string> = {
  4: 'Master',
  3: 'Consistent',
  2: 'Developing',
  1: 'Rarely',
};

type SortBy = 'self' | 'coach';

export function ClinicalBaselineResults({ 
  staffId, 
  assessmentId, 
  status,
  completedAt 
}: ClinicalBaselineResultsProps) {
  const { data: myStaff } = useStaffProfile();
  const [selectedItem, setSelectedItem] = useState<BaselineItem | null>(null);
  const [showOnlyNoted, setShowOnlyNoted] = useState(false);
  const [showCoachRatings, setShowCoachRatings] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [selfScoreFilters, setSelfScoreFilters] = useState<Set<number>>(new Set());
  const [coachScoreFilters, setCoachScoreFilters] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('self');

  // Fetch baseline assessment with flagged domains
  const { data: baseline } = useQuery({
    queryKey: ['doctor-baseline-flags', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, flagged_domains, reflection_original, reflection_formatted')
        .eq('id', assessmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Fetch baseline items
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['clinical-baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select(`
          action_id,
          self_score,
          self_note,
          pro_moves!inner (
            action_statement,
            competencies!inner (
              name,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name
              )
            )
          )
        `)
        .eq('assessment_id', assessmentId)
        .not('self_score', 'is', null);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        action_id: item.action_id,
        self_score: item.self_score,
        self_note: item.self_note || null,
        action_statement: item.pro_moves.action_statement,
        competency_name: item.pro_moves.competencies.name,
        domain_name: item.pro_moves.competencies.domains.domain_name,
        domain_id: item.pro_moves.competencies.domains.domain_id,
      })) as BaselineItem[];
    },
    enabled: !!assessmentId,
  });

  // Lazy-fetch coach ratings only when toggle is ON
  const { data: coachItems } = useQuery({
    queryKey: ['coach-baseline-items-compare', staffId, myStaff?.id],
    queryFn: async () => {
      if (!myStaff?.id) return [];
      const { data: assessment, error: aErr } = await supabase
        .from('coach_baseline_assessments')
        .select('id')
        .eq('doctor_staff_id', staffId)
        .eq('coach_staff_id', myStaff.id)
        .eq('status', 'completed')
        .maybeSingle();
      if (aErr) throw aErr;
      if (!assessment) return [];

      const { data, error } = await supabase
        .from('coach_baseline_items')
        .select('action_id, rating')
        .eq('assessment_id', assessment.id)
        .not('rating', 'is', null);
      if (error) throw error;
      return data || [];
    },
    enabled: showCoachRatings && !!myStaff?.id,
  });

  // Build coach ratings lookup
  const coachRatingsMap = useMemo(() => {
    const map = new Map<number, number>();
    coachItems?.forEach(ci => { if (ci.rating !== null) map.set(ci.action_id, ci.rating); });
    return map;
  }, [coachItems]);

  // Get total doctor ProMoves
  const { data: totalProMoves } = useQuery({
    queryKey: ['doctor-pro-moves-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pro_moves')
        .select('*', { count: 'exact', head: true })
        .eq('role_id', 4)
        .eq('active', true);
      if (error) throw error;
      return count || 0;
    },
  });

  // Group items by domain -> score
  const groupedByDomain = useMemo(() => {
    if (!items) return {} as GroupedData;
    const grouped: GroupedData = {};
    items.forEach((item) => {
      const domain = item.domain_name;
      if (!grouped[domain]) grouped[domain] = { 4: [], 3: [], 2: [], 1: [] };
      const score = item.self_score;
      if (score >= 1 && score <= 4) grouped[domain][score].push(item);
    });
    return grouped;
  }, [items]);

  const tallyCounts = useMemo(() => {
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    items?.forEach((item) => {
      const score = item.self_score;
      if (score >= 1 && score <= 4) counts[score as keyof typeof counts]++;
    });
    return counts;
  }, [items]);

  // Coach tally counts
  const coachTallyCounts = useMemo(() => {
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    coachRatingsMap.forEach((rating) => {
      if (rating >= 1 && rating <= 4) counts[rating as keyof typeof counts]++;
    });
    return counts;
  }, [coachRatingsMap]);

  const orderedDomains = useMemo(() => DOMAIN_ORDER.filter((d) => groupedByDomain[d]), [groupedByDomain]);

  const flaggedDomains = (baseline?.flagged_domains as string[]) || [];
  const completedCount = items?.length || 0;
  const progressPct = totalProMoves ? Math.round((completedCount / totalProMoves) * 100) : 0;

  const toggleSelfFilter = (score: number) => {
    setSelfScoreFilters(prev => {
      const next = new Set(prev);
      if (next.has(score)) next.delete(score);
      else next.add(score);
      return next;
    });
  };

  const toggleCoachFilter = (score: number) => {
    setCoachScoreFilters(prev => {
      const next = new Set(prev);
      if (next.has(score)) next.delete(score);
      else next.add(score);
      return next;
    });
    // Auto-enable coach ratings when filtering by coach score
    if (!showCoachRatings) setShowCoachRatings(true);
  };

  const getSortedDomainItems = (domain: string) => {
    const domainData = groupedByDomain[domain];
    if (!domainData) return [];
    let result = Object.entries(domainData)
      .flatMap(([score, items]) => items.map(item => ({ ...item, score: Number(score) })))
      .sort((a, b) => {
        if (sortBy === 'coach' && showCoachRatings) {
          const aCoach = coachRatingsMap.get(a.action_id) ?? 0;
          const bCoach = coachRatingsMap.get(b.action_id) ?? 0;
          if (bCoach !== aCoach) return bCoach - aCoach;
          return b.score - a.score;
        }
        if (b.score !== a.score) return b.score - a.score;
        const aCoach = coachRatingsMap.get(a.action_id) ?? 0;
        const bCoach = coachRatingsMap.get(b.action_id) ?? 0;
        return bCoach - aCoach;
      });

    // Apply self score filters
    if (selfScoreFilters.size > 0) {
      result = result.filter(item => selfScoreFilters.has(item.self_score));
    }
    // Apply coach score filters
    if (coachScoreFilters.size > 0) {
      result = result.filter(item => {
        const cs = coachRatingsMap.get(item.action_id);
        return cs !== undefined && coachScoreFilters.has(cs);
      });
    }
    if (showOnlyNoted) result = result.filter(item => item.self_note?.trim());
    return result;
  };

  const hasAnyNotes = items?.some(item => item.self_note?.trim()) ?? false;
  const hasCoachData = coachRatingsMap.size > 0;

  // Not started state
  if (!assessmentId) {
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-br from-muted/50 via-muted/30 to-background p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-muted">
              <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Baseline Assessment</h2>
              <p className="text-muted-foreground mt-1">The doctor has not yet started their baseline assessment.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (loadingItems) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  // In progress state
  if (status !== 'completed') {
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-br from-amber-50 via-amber-50/50 to-background dark:from-amber-950/30 dark:via-amber-950/10 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Baseline Assessment</h2>
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300">In Progress</Badge>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span>{completedCount} of {totalProMoves} Pro Moves</span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const anyFiltersActive = selfScoreFilters.size > 0 || coachScoreFilters.size > 0;

  return (
    <Collapsible defaultOpen className="space-y-4">
      <Card className="overflow-hidden border-0 shadow-lg">
        <CollapsibleTrigger className="w-full">
          <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-background dark:from-emerald-950/30 dark:via-emerald-950/10 p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">Baseline Self-Assessment</h2>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300">Complete</Badge>
                </div>
                {completedAt && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Completed {format(new Date(completedAt), 'MMMM d, yyyy')}
                  </p>
                )}
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </div>
            {flaggedDomains.length > 0 && (
              <div className="flex items-center gap-2 mt-3 ml-14 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  Flagged {flaggedDomains.length} domain{flaggedDomains.length > 1 ? 's' : ''} for discussion: {flaggedDomains.join(', ')}
                </span>
              </div>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Tally Filter Cards */}
          <div className="p-4 border-b bg-muted/20 space-y-3">
            {/* Doctor row */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Doctor Self-Rating</p>
              <div className="grid grid-cols-4 gap-2">
                {[4, 3, 2, 1].map((score) => {
                  const colors = SCORE_COLORS[score];
                  const isActive = selfScoreFilters.has(score);
                  return (
                    <button
                      key={score}
                      onClick={() => toggleSelfFilter(score)}
                      className={`text-center py-2.5 px-2 rounded-lg border-2 transition-all cursor-pointer ${isActive ? 'ring-1 ring-offset-1 shadow-md' : 'opacity-80 hover:opacity-100'}`}
                      style={{
                        backgroundColor: colors.bg,
                        borderColor: isActive ? colors.activeBorder : colors.border,
                      }}
                    >
                      <div className="text-xl font-bold" style={{ color: colors.text }}>{tallyCounts[score as keyof typeof tallyCounts]}</div>
                      <div className="text-[10px] font-medium" style={{ color: colors.text }}>{SCORE_LABELS[score]}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Coach row */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coach Rating</p>
                <div className="flex items-center gap-2">
                  <Switch id="show-coach-ratings" checked={showCoachRatings} onCheckedChange={setShowCoachRatings} />
                  <Label htmlFor="show-coach-ratings" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                    Coach ratings
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[4, 3, 2, 1].map((score) => {
                  const colors = SCORE_COLORS[score];
                  const isActive = coachScoreFilters.has(score);
                  const count = coachTallyCounts[score as keyof typeof coachTallyCounts];
                  return (
                    <button
                      key={score}
                      onClick={() => toggleCoachFilter(score)}
                      className={`text-center py-2.5 px-2 rounded-lg border-2 transition-all cursor-pointer ${isActive ? 'ring-1 ring-offset-1 shadow-md' : 'opacity-80 hover:opacity-100'} ${!hasCoachData && !showCoachRatings ? 'opacity-40' : ''}`}
                      style={{
                        backgroundColor: colors.bg,
                        borderColor: isActive ? colors.activeBorder : colors.border,
                      }}
                    >
                      <div className="text-xl font-bold" style={{ color: colors.text }}>{count}</div>
                      <div className="text-[10px] font-medium" style={{ color: colors.text }}>{SCORE_LABELS[score]}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {anyFiltersActive && (
              <button
                onClick={() => { setSelfScoreFilters(new Set()); setCoachScoreFilters(new Set()); }}
                className="text-xs text-primary hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Domain Tabs */}
          {orderedDomains.length > 0 && (
            <Tabs defaultValue={orderedDomains[0]} className="w-full">
              <div className="border-b flex items-center justify-between flex-wrap gap-2">
                <TabsList className="flex-1 h-auto p-0 bg-transparent rounded-none">
                  {orderedDomains.map((domain) => {
                    const domainColor = getDomainColorRichRaw(domain);
                    const isFlagged = flaggedDomains.includes(domain);
                    return (
                      <TabsTrigger
                        key={domain}
                        value={domain}
                        className="flex-1 py-3 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/50 font-medium transition-all"
                      >
                        <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: `hsl(${domainColor})` }} />
                        {domain}
                        {isFlagged && <AlertCircle className="h-3.5 w-3.5 ml-1.5 text-amber-500" />}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <div className="flex items-center gap-4 px-4">
                  {hasAnyNotes && (
                    <div className="flex items-center gap-2">
                      <Switch id="show-only-noted" checked={showOnlyNoted} onCheckedChange={setShowOnlyNoted} />
                      <Label htmlFor="show-only-noted" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        <MessageSquare className="h-3 w-3 inline mr-1" />Noted only
                      </Label>
                    </div>
                  )}
                </div>
              </div>

              {orderedDomains.map((domain) => {
                const sortedItems = getSortedDomainItems(domain);
                const isFlagged = flaggedDomains.includes(domain);

                return (
                  <TabsContent key={domain} value={domain} className="mt-0 p-0">
                    {isFlagged && (
                      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                          <AlertCircle className="h-4 w-4" />Doctor flagged this domain for discussion
                        </div>
                      </div>
                    )}
                    {/* Column headers with sortable Self/Coach */}
                    <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/10 text-xs text-muted-foreground">
                      <button
                        onClick={() => setSortBy('self')}
                        className={`w-8 text-center font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${sortBy === 'self' ? 'text-foreground' : 'hover:text-foreground/70'}`}
                      >
                        Self
                        {sortBy === 'self' && <ArrowDown className="h-3 w-3" />}
                      </button>
                      {showCoachRatings && (
                        <button
                          onClick={() => setSortBy('coach')}
                          className={`w-8 text-center font-medium flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${sortBy === 'coach' ? 'text-foreground' : 'hover:text-foreground/70'}`}
                        >
                          Coach
                          {sortBy === 'coach' && <ArrowDown className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                    <div className="divide-y">
                      {sortedItems.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No items match the current filters.
                        </div>
                      )}
                      {sortedItems.map((item) => {
                        const colors = SCORE_COLORS[item.score];
                        const coachScore = coachRatingsMap.get(item.action_id);
                        const hasBigDiff = coachScore !== undefined && Math.abs(item.self_score - coachScore) >= 2;
                        const hasNote = !!item.self_note?.trim();
                        const isExpanded = expandedNoteId === item.action_id;

                        return (
                          <div key={item.action_id}>
                            <button
                              onClick={() => {
                                if (hasNote) {
                                  setExpandedNoteId(isExpanded ? null : item.action_id);
                                } else {
                                  setSelectedItem(item);
                                }
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left group ${hasBigDiff ? 'ring-1 ring-inset ring-amber-300 dark:ring-amber-700' : ''}`}
                              style={{ backgroundColor: hasBigDiff ? 'hsl(38 90% 97%)' : colors.bg }}
                            >
                              <div
                                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                              >
                                {item.score}
                              </div>
                              {showCoachRatings && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border bg-background border-border text-foreground">
                                  {coachScore !== undefined ? coachScore : '–'}
                                </div>
                              )}
                              {hasNote && (
                                <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{item.action_statement}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.competency_name}</p>
                              </div>
                              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${hasNote ? (isExpanded ? 'rotate-0' : '-rotate-90') : '-rotate-90 opacity-0 group-hover:opacity-100'}`} />
                            </button>
                            {hasNote && isExpanded && (
                              <div className="bg-muted/30 border-t px-4 py-3 space-y-2">
                                <p className="text-sm whitespace-pre-wrap text-foreground">{item.self_note}</p>
                                <button
                                  onClick={() => setSelectedItem(item)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View details →
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}

          {/* Reflection Section */}
          {baseline?.reflection_formatted && (
            <div className="p-4">
              <ReflectionSection formatted={baseline.reflection_formatted} original={baseline.reflection_original} />
            </div>
          )}
        </CollapsibleContent>
      </Card>

      <DoctorMaterialsSheet
        proMoveId={selectedItem?.action_id || null}
        proMoveStatement={selectedItem?.action_statement || ''}
        onClose={() => setSelectedItem(null)}
        noteText={selectedItem?.self_note}
      />
    </Collapsible>
  );
}
