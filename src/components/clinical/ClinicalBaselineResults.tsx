import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { ClipboardCheck, CheckCircle2, Clock, AlertCircle, ChevronDown } from 'lucide-react';
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

// Canonical domain order
const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

export function ClinicalBaselineResults({ 
  staffId, 
  assessmentId, 
  status,
  completedAt 
}: ClinicalBaselineResultsProps) {
  const [selectedItem, setSelectedItem] = useState<BaselineItem | null>(null);

  // Fetch baseline assessment with flagged domains
  const { data: baseline } = useQuery({
    queryKey: ['doctor-baseline-flags', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, flagged_domains')
        .eq('id', assessmentId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Fetch baseline items with pro moves and domain info
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['clinical-baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      
      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select(`
          action_id,
          self_score,
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
      
      // Flatten the nested structure
      return (data || []).map((item: any) => ({
        action_id: item.action_id,
        self_score: item.self_score,
        action_statement: item.pro_moves.action_statement,
        competency_name: item.pro_moves.competencies.name,
        domain_name: item.pro_moves.competencies.domains.domain_name,
        domain_id: item.pro_moves.competencies.domains.domain_id,
      })) as BaselineItem[];
    },
    enabled: !!assessmentId,
  });

  // Get total doctor ProMoves for progress calculation
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
      if (!grouped[domain]) {
        grouped[domain] = { 4: [], 3: [], 2: [], 1: [] };
      }
      const score = item.self_score;
      if (score >= 1 && score <= 4) {
        grouped[domain][score].push(item);
      }
    });
    
    return grouped;
  }, [items]);

  // Calculate tally counts
  const tallyCounts = useMemo(() => {
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    items?.forEach((item) => {
      const score = item.self_score;
      if (score >= 1 && score <= 4) {
        counts[score as keyof typeof counts]++;
      }
    });
    return counts;
  }, [items]);

  // Get domains in canonical order
  const orderedDomains = useMemo(() => {
    return DOMAIN_ORDER.filter((d) => groupedByDomain[d]);
  }, [groupedByDomain]);

  const flaggedDomains = (baseline?.flagged_domains as string[]) || [];
  const completedCount = items?.length || 0;
  const progressPct = totalProMoves ? Math.round((completedCount / totalProMoves) * 100) : 0;

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
              <p className="text-muted-foreground mt-1">
                The doctor has not yet started their baseline assessment.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Loading state
  if (loadingItems) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
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
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300">
                  In Progress
                </Badge>
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

  // Score color config
  const SCORE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
    4: { bg: 'hsl(160 60% 95%)', border: 'hsl(160 50% 80%)', text: 'hsl(160 80% 25%)' },
    3: { bg: 'hsl(210 80% 95%)', border: 'hsl(210 60% 80%)', text: 'hsl(210 80% 30%)' },
    2: { bg: 'hsl(38 90% 95%)', border: 'hsl(38 70% 75%)', text: 'hsl(38 80% 30%)' },
    1: { bg: 'hsl(0 70% 95%)', border: 'hsl(0 60% 80%)', text: 'hsl(0 70% 35%)' },
  };

  // Flatten and sort items by score descending for each domain
  const getSortedDomainItems = (domain: string) => {
    const domainData = groupedByDomain[domain];
    if (!domainData) return [];
    return Object.entries(domainData)
      .flatMap(([score, items]) => items.map(item => ({ ...item, score: Number(score) })))
      .sort((a, b) => b.score - a.score);
  };

  // Completed state - full results view
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
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300">
                    Complete
                  </Badge>
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
          {/* Tally Row - Score Summary */}
          <div className="grid grid-cols-4 gap-2 p-4 border-b bg-muted/20">
            {[
              { score: 4, label: 'Exceptional' },
              { score: 3, label: 'Excellent' },
              { score: 2, label: 'Room to Grow' },
              { score: 1, label: 'Needs Focus' },
            ].map(({ score, label }) => {
              const colors = SCORE_COLORS[score];
              return (
                <div 
                  key={score} 
                  className="text-center py-3 px-2 rounded-lg border"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                >
                  <div className="text-2xl font-bold" style={{ color: colors.text }}>
                    {tallyCounts[score as keyof typeof tallyCounts]}
                  </div>
                  <div className="text-xs font-medium" style={{ color: colors.text }}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Domain Tabs */}
          {orderedDomains.length > 0 && (
            <Tabs defaultValue={orderedDomains[0]} className="w-full">
              <div className="border-b">
                <TabsList className="w-full h-auto p-0 bg-transparent rounded-none">
                  {orderedDomains.map((domain) => {
                    const domainColor = getDomainColorRichRaw(domain);
                    const isFlagged = flaggedDomains.includes(domain);
                    return (
                      <TabsTrigger 
                        key={domain} 
                        value={domain} 
                        className="flex-1 py-3 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/50 font-medium transition-all"
                      >
                        <span 
                          className="w-2.5 h-2.5 rounded-full mr-2"
                          style={{ backgroundColor: `hsl(${domainColor})` }}
                        />
                        {domain}
                        {isFlagged && (
                          <AlertCircle className="h-3.5 w-3.5 ml-1.5 text-amber-500" />
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {orderedDomains.map((domain) => {
                const sortedItems = getSortedDomainItems(domain);
                const isFlagged = flaggedDomains.includes(domain);
                
                return (
                  <TabsContent 
                    key={domain} 
                    value={domain} 
                    className="mt-0 p-0"
                  >
                    {isFlagged && (
                      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          Doctor flagged this domain for discussion
                        </div>
                      </div>
                    )}
                    
                    {/* Pro Move Rows - sorted by score descending */}
                    <div className="divide-y">
                      {sortedItems.map((item) => {
                        const colors = SCORE_COLORS[item.score];
                        return (
                          <button
                            key={item.action_id}
                            onClick={() => setSelectedItem(item)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left group"
                            style={{ backgroundColor: colors.bg }}
                          >
                            <div 
                              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border"
                              style={{ 
                                backgroundColor: colors.bg, 
                                borderColor: colors.border,
                                color: colors.text 
                              }}
                            >
                              {item.score}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {item.action_statement}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.competency_name}
                              </p>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CollapsibleContent>
      </Card>

      {/* Materials Sheet */}
      <DoctorMaterialsSheet
        proMoveId={selectedItem?.action_id || null}
        proMoveStatement={selectedItem?.action_statement || ''}
        onClose={() => setSelectedItem(null)}
      />
    </Collapsible>
  );
}
