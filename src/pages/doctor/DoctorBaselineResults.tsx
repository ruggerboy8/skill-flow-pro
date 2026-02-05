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
import { Skeleton } from '@/components/ui/skeleton';

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
        .select('id, status, completed_at, flagged_domains')
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Baseline Self-Assessment</h1>
        {baseline.completed_at && (
          <p className="text-sm text-muted-foreground mt-1">
            Completed {format(new Date(baseline.completed_at), 'MMMM d, yyyy')}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2 italic">
          This is a self-calibration snapshot. Ratings are most useful when they reflect consistency, not intent.
        </p>
      </div>

      {/* Tally Row */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-around text-center">
            <div>
              <span className="text-2xl font-bold text-emerald-600">{tallyCounts[4]}</span>
              <span className="text-sm text-muted-foreground ml-1">4s</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="text-2xl font-bold text-blue-600">{tallyCounts[3]}</span>
              <span className="text-sm text-muted-foreground ml-1">3s</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="text-2xl font-bold text-amber-600">{tallyCounts[2]}</span>
              <span className="text-sm text-muted-foreground ml-1">2s</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="text-2xl font-bold text-red-600">{tallyCounts[1]}</span>
              <span className="text-sm text-muted-foreground ml-1">1s</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domain Tabs */}
      {orderedDomains.length > 0 && (
        <Tabs defaultValue={orderedDomains[0]} className="w-full">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            {orderedDomains.map((domain) => (
              <TabsTrigger key={domain} value={domain} className="flex-1 min-w-fit">
                {domain}
              </TabsTrigger>
            ))}
          </TabsList>

          {orderedDomains.map((domain) => {
            const domainData = groupedByDomain[domain];
            const hasFours = domainData[4].length > 0;
            
            return (
              <TabsContent key={domain} value={domain} className="mt-4 space-y-3">
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
