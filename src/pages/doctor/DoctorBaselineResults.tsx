import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';
import { ReflectionSection } from '@/components/doctor/ReflectionSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { ClipboardCheck, CheckCircle2, MessageSquare, ChevronDown, GraduationCap, ArrowDown } from 'lucide-react';

interface BaselineItem {
  action_id: number;
  self_score: number;
  self_note: string | null;
  action_statement: string;
  competency_name: string;
  domain_name: string;
  domain_id: number;
}

interface GroupedData {
  [domainName: string]: BaselineItem[];
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

export default function DoctorBaselineResults() {
  const { data: staff } = useStaffProfile();
  const [selectedItem, setSelectedItem] = useState<BaselineItem | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [selfScoreFilters, setSelfScoreFilters] = useState<Set<number>>(new Set());
  const [showOnlyNoted, setShowOnlyNoted] = useState(false);

  // Fetch baseline assessment
  const { data: baseline, isLoading: loadingBaseline } = useQuery({
    queryKey: ['my-baseline', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, completed_at, reflection_original, reflection_formatted, reflection_mode, reflection_submitted_at')
        .eq('doctor_staff_id', staff.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  // Fetch baseline items with pro moves and domain info
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['baseline-items', baseline?.id],
    queryFn: async () => {
      if (!baseline?.id) return [];
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
        .eq('assessment_id', baseline.id)
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
    enabled: !!baseline?.id,
  });

  // Group items by domain
  const groupedByDomain = useMemo(() => {
    if (!items) return {} as GroupedData;
    const grouped: GroupedData = {};
    items.forEach((item) => {
      const domain = item.domain_name;
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push(item);
    });
    return grouped;
  }, [items]);

  // Calculate tally counts
  const tallyCounts = useMemo(() => {
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    items?.forEach((item) => {
      const score = item.self_score;
      if (score >= 1 && score <= 4) counts[score as keyof typeof counts]++;
    });
    return counts;
  }, [items]);

  const orderedDomains = useMemo(() => DOMAIN_ORDER.filter((d) => groupedByDomain[d]), [groupedByDomain]);

  const toggleSelfFilter = (score: number) => {
    setSelfScoreFilters(prev => {
      const next = new Set(prev);
      if (next.has(score)) next.delete(score);
      else next.add(score);
      return next;
    });
  };

  const getSortedDomainItems = (domain: string) => {
    let result = [...(groupedByDomain[domain] || [])].sort((a, b) => b.self_score - a.self_score);
    if (selfScoreFilters.size > 0) {
      result = result.filter(item => selfScoreFilters.has(item.self_score));
    }
    if (showOnlyNoted) result = result.filter(item => item.self_note?.trim());
    return result;
  };

  const hasAnyNotes = items?.some(item => item.self_note?.trim()) ?? false;
  const anyFiltersActive = selfScoreFilters.size > 0;

  const isLoading = loadingBaseline || loadingItems;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!baseline || baseline.status !== 'completed') {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>No Baseline Found</CardTitle>
            <CardDescription>
              Complete your baseline self-assessment to view your results.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Baseline Self-Assessment</h1>
              {baseline.completed_at && (
                <div className="flex items-center gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">
                    Completed {format(new Date(baseline.completed_at), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-3 italic border-l-2 border-primary/30 pl-3">
                This is a self-calibration snapshot. Ratings are most useful when they reflect consistency, not intent.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Tally Filter Cards */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Self-Rating</p>
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
        {anyFiltersActive && (
          <button
            onClick={() => setSelfScoreFilters(new Set())}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Domain Tabs with flat list */}
      {orderedDomains.length > 0 && (
        <Card className="border-0 shadow-lg overflow-hidden">
          <Tabs defaultValue={orderedDomains[0]} className="w-full">
            <div className="border-b flex items-center justify-between flex-wrap gap-2">
              <TabsList className="flex-1 h-auto p-0 bg-transparent rounded-none">
                {orderedDomains.map((domain) => {
                  const domainColor = getDomainColorRichRaw(domain);
                  return (
                    <TabsTrigger
                      key={domain}
                      value={domain}
                      className="flex-1 py-3 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/50 font-medium transition-all"
                    >
                      <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: `hsl(${domainColor})` }} />
                      {domain}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <div className="flex items-center gap-4 px-4">
                {hasAnyNotes && (
                  <div className="flex items-center gap-2">
                    <Switch id="doc-show-only-noted" checked={showOnlyNoted} onCheckedChange={setShowOnlyNoted} />
                    <Label htmlFor="doc-show-only-noted" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                      <MessageSquare className="h-3 w-3 inline mr-1" />Noted only
                    </Label>
                  </div>
                )}
                {(selfScoreFilters.size > 0 || showOnlyNoted) && (
                  <button
                    onClick={() => { setSelfScoreFilters(new Set()); setShowOnlyNoted(false); }}
                    className="text-xs text-destructive hover:underline whitespace-nowrap"
                  >
                    Reset all
                  </button>
                )}
              </div>
            </div>

            {orderedDomains.map((domain) => {
              const sortedItems = getSortedDomainItems(domain);
              return (
                <TabsContent key={domain} value={domain} className="mt-0 p-0">
                  {/* Column header */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/10 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded font-semibold flex items-center gap-0.5 bg-primary text-primary-foreground shadow-sm">
                      Score
                      <ArrowDown className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="divide-y">
                    {sortedItems.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No items match the current filters.
                      </div>
                    )}
                    {sortedItems.map((item) => {
                      const hasNote = !!item.self_note?.trim();
                      const isExpanded = expandedNoteId === item.action_id;
                      const colors = SCORE_COLORS[item.self_score];

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
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left group"
                            style={{ backgroundColor: colors.bg }}
                          >
                            <div
                              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border"
                              style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                            >
                              {item.self_score}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{item.action_statement}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-xs text-muted-foreground">{item.competency_name}</p>
                                {hasNote && (
                                  <span className="flex items-center gap-0.5 text-primary">
                                    <MessageSquare className="h-3 w-3" />
                                    <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                              className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                              title="View learning materials"
                            >
                              <GraduationCap className="h-4 w-4" />
                            </button>
                          </button>
                          {hasNote && isExpanded && (
                            <div className="bg-muted/30 border-t px-4 py-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Your note</p>
                              <p className="text-sm whitespace-pre-wrap text-foreground">{item.self_note}</p>
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
        </Card>
      )}

      {/* Reflection Section */}
      {baseline?.reflection_formatted && (
        <ReflectionSection
          formatted={baseline.reflection_formatted}
          original={baseline.reflection_original}
        />
      )}

      {/* Materials Sheet */}
      <DoctorMaterialsSheet
        proMoveId={selectedItem?.action_id || null}
        proMoveStatement={selectedItem?.action_statement || ''}
        onClose={() => setSelectedItem(null)}
        noteText={selectedItem?.self_note}
      />
    </div>
  );
}
