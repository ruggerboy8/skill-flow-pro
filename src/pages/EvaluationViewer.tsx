import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getEvaluation } from '@/lib/evaluations';
import { getDomainColor } from '@/lib/domainColors';
import { DOMAIN_ORDER, getDomainOrderIndex } from '@/lib/domainUtils';
import type { EvaluationWithItems } from '@/lib/evaluations';

const SCORE_PILLS = [
  { value: 1, label: '1', className: 'bg-red-100 text-red-800 border-red-200' },
  { value: 2, label: '2', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 3, label: '3', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 4, label: '4', className: 'bg-green-100 text-green-800 border-green-200' },
];

function ReadOnlyScore({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pill = SCORE_PILLS.find(p => p.value === value);
  return <span className={`px-3 py-1 text-sm rounded border ${pill?.className}`}>{pill?.label}</span>;
}

type GroupedItem = {
  competency_id: number;
  competency_name_snapshot: string;
  competency_description_snapshot: string | null;
  domain_name: string;
  self_score: number | null;
  observer_score: number | null;
  self_note: string | null;
  observer_note: string | null;
};

export default function EvaluationViewer() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationWithItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !evalId) return;

    (async () => {
      try {
        // Get current user's staff id
        const { data: staff } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!staff) {
          setError("Staff record not found.");
          return;
        }

        // Get evaluation
        const evalData = await getEvaluation(evalId);
        
        if (!evalData) {
          setError("Evaluation not found.");
          return;
        }

        // Check access: must be this user's evaluation and must be submitted
        if (evalData.staff_id !== staff.id || evalData.status !== 'submitted') {
          setError("You don't have access to this evaluation.");
          return;
        }

        setEvaluation(evalData);
      } catch (err) {
        console.error('Error loading evaluation:', err);
        setError("Failed to load evaluation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, evalId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !evaluation) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">{error || "Evaluation not found."}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => navigate('/stats/evaluations')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Evaluations
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Group items by domain and sort
  const groupedByDomain = evaluation.items.reduce((acc, item) => {
    const domainName = item.domain_name || 'General';
    if (!acc[domainName]) {
      acc[domainName] = [];
    }
    acc[domainName].push(item);
    return acc;
  }, {} as Record<string, GroupedItem[]>);

  // Sort domains by predefined order
  const sortedDomains = Object.keys(groupedByDomain).sort((a, b) => {
    return getDomainOrderIndex(a) - getDomainOrderIndex(b);
  });

  // Sort items within each domain by competency_id
  sortedDomains.forEach(domain => {
    groupedByDomain[domain].sort((a, b) => a.competency_id - b.competency_id);
  });

  const submittedDate = evaluation.updated_at ? new Date(evaluation.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric', 
    year: 'numeric'
  }) : '';

  // Count scores
  const totalItems = evaluation.items.length;
  const observerScored = evaluation.items.filter(item => item.observer_score != null).length;
  const selfScored = evaluation.items.filter(item => item.self_score != null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/stats/evaluations')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {evaluation.type} {evaluation.quarter} {evaluation.program_year} Evaluation
          </h1>
          <p className="text-muted-foreground">
            Submitted {submittedDate}
          </p>
          <p className="text-sm text-muted-foreground">
            Observer items scored {observerScored}/{totalItems} • Self items scored {selfScored}/{totalItems}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="observation" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="observation">Observation</TabsTrigger>
          <TabsTrigger value="self">Self-Assessment</TabsTrigger>
        </TabsList>

        <TabsContent value="observation" className="space-y-6">
          {sortedDomains.map(domainName => (
            <Card key={domainName}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge 
                    variant="outline"
                    style={{ backgroundColor: getDomainColor(domainName) }}
                    className="text-slate-900"
                  >
                    {domainName}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {groupedByDomain[domainName].map(item => (
                  <div key={item.competency_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{item.competency_name_snapshot}</h4>
                      <ReadOnlyScore value={item.observer_score} />
                    </div>
                    {item.competency_description_snapshot && (
                      <p className="text-sm text-muted-foreground italic">
                        {item.competency_description_snapshot}
                      </p>
                    )}
                    {item.observer_note && (
                      <div className="p-3 bg-muted/50 rounded text-sm">
                        <strong>Observer Note:</strong> {item.observer_note}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="self" className="space-y-6">
          {sortedDomains.map(domainName => (
            <Card key={domainName}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge 
                    variant="outline"
                    style={{ backgroundColor: getDomainColor(domainName) }}
                    className="text-slate-900"
                  >
                    {domainName}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {groupedByDomain[domainName].map(item => (
                  <div key={item.competency_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{item.competency_name_snapshot}</h4>
                      <ReadOnlyScore value={item.self_score} />
                    </div>
                    {item.competency_description_snapshot && (
                      <p className="text-sm text-muted-foreground italic">
                        {item.competency_description_snapshot}
                      </p>
                    )}
                    {item.self_note && (
                      <div className="p-3 bg-muted/50 rounded text-sm">
                        <strong>Self Note:</strong> {item.self_note}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}