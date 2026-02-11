import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RatingBandCollapsible } from '@/components/doctor/RatingBandCollapsible';
import { GutCheckPrompt } from '@/components/doctor/GutCheckPrompt';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';
import { ReflectionSection } from '@/components/doctor/ReflectionSection';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import { ClipboardCheck, CheckCircle2, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

// Canonical domain order
const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

export default function DoctorBaselineResults() {
  const { data: staff } = useStaffProfile();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<BaselineItem | null>(null);

  // Fetch baseline assessment
  const { data: baseline, isLoading: loadingBaseline } = useQuery({
    queryKey: ['my-baseline', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, completed_at, flagged_domains, reflection_original, reflection_formatted, reflection_mode, reflection_submitted_at')
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
              domains!inner (
                domain_id,
                domain_name
              )
            )
          )
        `)
        .eq('assessment_id', baseline.id)
        .not('self_score', 'is', null);
      
      if (error) throw error;
      
      // Flatten the nested structure
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

  // Mutation to flag a domain
  const flagMutation = useMutation({
    mutationFn: async (domainName: string) => {
      if (!baseline?.id) throw new Error('No baseline found');
      
      const currentFlags = (baseline.flagged_domains as string[]) || [];
      if (currentFlags.includes(domainName)) return;
      
      const newFlags = [...currentFlags, domainName];
      
      const { error } = await supabase
        .from('doctor_baseline_assessments')
        .update({ flagged_domains: newFlags })
        .eq('id', baseline.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-baseline', staff?.id] });
    },
  });

  const isLoading = loadingBaseline || loadingItems;
  const flaggedDomains = (baseline?.flagged_domains as string[]) || [];

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
                  return (
                    <TabsTrigger 
                      key={domain} 
                      value={domain} 
                      className="flex-1 min-w-fit data-[state=active]:shadow-sm transition-all"
                      style={{
                        '--domain-color': `hsl(${domainColor})`,
                      } as React.CSSProperties}
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-2 hidden sm:inline-block"
                        style={{ backgroundColor: `hsl(${domainColor})` }}
                      />
                      {domain}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {orderedDomains.map((domain) => {
              const domainData = groupedByDomain[domain];
              const hasFours = domainData[4].length > 0;
              const domainColor = getDomainColorRaw(domain);
              const domainColorRich = getDomainColorRichRaw(domain);
              
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
                  </div>

                  {/* Gut Check Prompt */}
                  <GutCheckPrompt
                    domainName={domain}
                    hasFoursInDomain={hasFours}
                    isAlreadyFlagged={flaggedDomains.includes(domain)}
                    onFlag={async (d) => flagMutation.mutateAsync(d)}
                  />

                  {/* Rating Bands - 4, 3, 2, 1 order */}
                  {[4, 3, 2, 1].map((score) => (
                    <RatingBandCollapsible
                      key={score}
                      score={score}
                      items={domainData[score].map(item => ({
                        action_id: item.action_id,
                        action_statement: item.action_statement,
                        competency_name: item.competency_name,
                        self_note: item.self_note,
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
