import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RatingBandCollapsible } from '@/components/doctor/RatingBandCollapsible';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import { ClipboardCheck, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
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

  // Completed state - full results view
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-background dark:from-emerald-950/30 dark:via-emerald-950/10 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Baseline Self-Assessment</h2>
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300">
                  Complete
                </Badge>
              </div>
              {completedAt && (
                <p className="text-sm text-muted-foreground mt-1">
                  Completed {format(new Date(completedAt), 'MMMM d, yyyy')}
                </p>
              )}
              {flaggedDomains.length > 0 && (
                <div className="flex items-center gap-2 mt-3 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">
                    Doctor flagged {flaggedDomains.length} domain{flaggedDomains.length > 1 ? 's' : ''} for discussion: {flaggedDomains.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tally Row - Score Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { score: 4, label: 'Consistent', bgColor: 'hsl(160 60% 95%)', textColor: 'hsl(160 80% 35%)', borderColor: 'hsl(160 50% 70%)' },
          { score: 3, label: 'Usually', bgColor: 'hsl(210 80% 95%)', textColor: 'hsl(210 80% 45%)', borderColor: 'hsl(210 60% 70%)' },
          { score: 2, label: 'Sometimes', bgColor: 'hsl(38 90% 95%)', textColor: 'hsl(38 80% 40%)', borderColor: 'hsl(38 70% 65%)' },
          { score: 1, label: 'Rare', bgColor: 'hsl(0 70% 95%)', textColor: 'hsl(0 70% 45%)', borderColor: 'hsl(0 60% 70%)' },
        ].map(({ score, label, bgColor, textColor, borderColor }) => (
          <Card 
            key={score} 
            className="text-center border-0 shadow-sm"
            style={{ backgroundColor: bgColor }}
          >
            <CardContent className="py-4 px-2">
              <div 
                className="text-3xl font-bold"
                style={{ color: textColor }}
              >
                {tallyCounts[score as keyof typeof tallyCounts]}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
              <Badge 
                variant="outline" 
                className="mt-2"
                style={{ color: textColor, borderColor: borderColor }}
              >
                {score}s
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Domain Tabs */}
      {orderedDomains.length > 0 && (
        <Card className="border-0 shadow-lg overflow-hidden">
          <Tabs defaultValue={orderedDomains[0]} className="w-full">
            <div className="border-b bg-muted/30">
              <TabsList className="w-full h-auto p-1 bg-transparent gap-1">
                {orderedDomains.map((domain) => {
                  const domainColor = getDomainColorRichRaw(domain);
                  const isFlagged = flaggedDomains.includes(domain);
                  return (
                    <TabsTrigger 
                      key={domain} 
                      value={domain} 
                      className="flex-1 min-w-fit data-[state=active]:shadow-sm transition-all"
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-2 hidden sm:inline-block"
                        style={{ backgroundColor: `hsl(${domainColor})` }}
                      />
                      {domain}
                      {isFlagged && (
                        <AlertCircle className="h-3 w-3 ml-1 text-amber-500" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {orderedDomains.map((domain) => {
              const domainData = groupedByDomain[domain];
              const domainColor = getDomainColorRaw(domain);
              const domainColorRich = getDomainColorRichRaw(domain);
              const isFlagged = flaggedDomains.includes(domain);
              
              return (
                <TabsContent 
                  key={domain} 
                  value={domain} 
                  className="mt-0 p-4 space-y-3"
                  style={{
                    background: `linear-gradient(135deg, hsl(${domainColor} / 0.15) 0%, transparent 50%)`,
                  }}
                >
                  {/* Domain Header Badge */}
                  <div className="flex items-center gap-2 mb-4">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: `hsl(${domainColorRich})` }}
                    />
                    <span className="font-medium text-sm" style={{ color: `hsl(${domainColorRich})` }}>
                      {domain}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({Object.values(domainData).flat().length} items)
                    </span>
                    {isFlagged && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                        Flagged for discussion
                      </Badge>
                    )}
                  </div>

                  {/* Rating Bands - 4, 3, 2, 1 order */}
                  {[4, 3, 2, 1].map((score) => (
                    <RatingBandCollapsible
                      key={score}
                      score={score}
                      items={domainData[score].map(item => ({
                        action_id: item.action_id,
                        action_statement: item.action_statement,
                        competency_name: item.competency_name,
                      }))}
                      defaultOpen={score === 4}
                      onItemClick={(item) => {
                        const fullItem = domainData[score].find(i => i.action_id === item.action_id);
                        if (fullItem) setSelectedItem(fullItem);
                      }}
                    />
                  ))}
                </TabsContent>
              );
            })}
          </Tabs>
        </Card>
      )}

      {/* Materials Sheet */}
      <DoctorMaterialsSheet
        proMoveId={selectedItem?.action_id || null}
        proMoveStatement={selectedItem?.action_statement || ''}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
