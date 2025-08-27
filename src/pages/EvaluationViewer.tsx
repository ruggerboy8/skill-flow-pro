import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getEvaluation } from '@/lib/evaluations';
import { getDomainColor } from '@/lib/domainColors';
import { DOMAIN_ORDER, getDomainOrderIndex } from '@/lib/domainUtils';
import type { EvaluationWithItems } from '@/lib/evaluations';

const SCORE_PILLS = [
  { v: 1, cls: 'bg-red-100 text-red-800 border-red-200' },
  { v: 2, cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  { v: 3, cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { v: 4, cls: 'bg-green-100 text-green-800 border-green-200' },
];

function ReadOnlyScore({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pill = SCORE_PILLS.find(p => p.v === value);
  return <span className={`px-2.5 py-1 rounded border text-sm ${pill?.cls}`}>{value}</span>;
}

type RolledNote = { source: 'Observer' | 'Self'; competency: string; text: string };

const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10;
const avg = (arr: Array<number | null>) => {
  const vals = arr.filter((v): v is number => v != null);
  return vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};

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

      {/* Domain Sections */}
      <div className="space-y-6">
        {sortedDomains.map(domainName => {
          const domainItems = groupedByDomain[domainName];
          
          // Calculate domain averages
          const avgObserver = avg(domainItems.map(item => item.observer_score));
          const avgSelf = avg(domainItems.map(item => item.self_score));
          
          // Collect notes for this domain
          const notes: RolledNote[] = domainItems.flatMap(item => {
            const out: RolledNote[] = [];
            if (item.observer_note) {
              out.push({ 
                source: 'Observer', 
                competency: item.competency_name_snapshot, 
                text: item.observer_note 
              });
            }
            if (item.self_note) {
              out.push({ 
                source: 'Self', 
                competency: item.competency_name_snapshot, 
                text: item.self_note 
              });
            }
            return out;
          });

          return (
            <Card key={domainName} className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-xs"
                    style={{ backgroundColor: getDomainColor(domainName), color: '#000' }}
                  >
                    {domainName}
                  </span>
                  <span>{domainName}</span>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-12 text-xs text-muted-foreground">
                  <div className="col-span-7">Competency</div>
                  <div className="col-span-2 text-center">Observer</div>
                  <div className="col-span-3 text-center">Self</div>
                </div>

                {/* Competency rows */}
                <div className="space-y-2">
                  {domainItems.map(item => (
                    <div key={item.competency_id} className="grid grid-cols-12 items-center py-2 border-b last:border-0">
                      <div className="col-span-7">
                        <div className="text-sm font-medium">{item.competency_name_snapshot}</div>
                        {item.competency_description_snapshot && (
                          <div className="text-xs text-muted-foreground italic">{item.competency_description_snapshot}</div>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <ReadOnlyScore value={item.observer_score} />
                      </div>
                      <div className="col-span-3 flex justify-center">
                        <ReadOnlyScore value={item.self_score} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Averages row */}
                <div className="grid grid-cols-12 items-center pt-2 border-t">
                  <div className="col-span-7 text-sm font-medium">Averages</div>
                  <div className="col-span-2 text-center text-sm">{avgObserver ?? '—'}</div>
                  <div className="col-span-3 text-center text-sm">{avgSelf ?? '—'}</div>
                </div>

                {/* Notes accordion */}
                {notes.length > 0 && (
                  <div className="pt-2">
                    <Accordion type="single" collapsible>
                      <AccordionItem value="notes">
                        <AccordionTrigger className="text-sm">Notes ({notes.length})</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {notes.map((note, idx) => (
                              <div key={idx} className="text-sm">
                                <span className={`inline-block px-2 py-0.5 mr-2 rounded text-xs ${
                                  note.source === 'Observer' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                                }`}>
                                  {note.source}
                                </span>
                                <span className="font-medium">{note.competency}: </span>
                                <span className="text-muted-foreground">{note.text}</span>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}