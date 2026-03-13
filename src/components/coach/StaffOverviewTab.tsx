import { useMemo } from 'react';
import { subWeeks } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDomainColorRich, getDomainColorRichRaw } from '@/lib/domainColors';
import { DomainConfidenceTrend } from '@/components/coach/DomainConfidenceTrend';
import { ClipboardList } from 'lucide-react';

interface ScoreRow {
  week_of: string;
  domain_name: string;
  confidence_score: number | null;
}

interface StaffOverviewTabProps {
  rawData: ScoreRow[];
  /** Number of submitted evaluations this staff member has */
  evalCount?: number;
}

function getScoreColor(avg: number): string {
  if (avg >= 3.0) return 'text-emerald-600 dark:text-emerald-400';
  if (avg >= 2.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getScoreBg(avg: number): string {
  if (avg >= 3.0) return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/50';
  if (avg >= 2.5) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/50';
  return 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/50';
}

export function StaffOverviewTab({ rawData, evalCount = 0 }: StaffOverviewTabProps) {
  // Domain confidence averages over the last 6 weeks
  const domainAvgs = useMemo(() => {
    const sixWeeksAgo = subWeeks(new Date(), 6);
    const byDomain = new Map<string, { sum: number; count: number }>();

    rawData.forEach(row => {
      if (row.confidence_score === null || !row.domain_name || !row.week_of) return;
      if (new Date(row.week_of) < sixWeeksAgo) return;

      const existing = byDomain.get(row.domain_name) ?? { sum: 0, count: 0 };
      existing.sum += row.confidence_score;
      existing.count += 1;
      byDomain.set(row.domain_name, existing);
    });

    return Array.from(byDomain.entries())
      .map(([domain, { sum, count }]) => ({ domain, avg: sum / count }))
      .sort((a, b) => a.avg - b.avg); // lowest first
  }, [rawData]);

  const lowestDomains = domainAvgs.slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Domain Confidence Trend */}
      <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
        <CardHeader className="pb-3 px-0 md:px-6">
          <CardTitle className="text-base">Domain Confidence Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          <DomainConfidenceTrend rawData={rawData} />
        </CardContent>
      </Card>

      {/* Lowest Self-Reported Domains */}
      {lowestDomains.length > 0 && (
        <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
          <CardHeader className="pb-3 px-0 md:px-6">
            <div>
              <CardTitle className="text-base">Lowest Self-Reported Domains</CardTitle>
              <p className="text-xs text-muted-foreground">
                Averaged over last 6 weeks · self-reported confidence
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-0 md:px-6">
            <div className="flex flex-wrap gap-3">
              {lowestDomains.map(({ domain, avg }) => {
                const richRaw = getDomainColorRichRaw(domain);
                const richColor = getDomainColorRich(domain);
                return (
                  <div
                    key={domain}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${getScoreBg(avg)}`}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: richColor }}
                    />
                    <div>
                      <p
                        className="text-xs font-bold uppercase tracking-wide"
                        style={{ color: richColor }}
                      >
                        {domain}
                      </p>
                      <p className={`text-xl font-black ${getScoreColor(avg)}`}>
                        {avg.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-0.5">/4</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eval Prep Note */}
      {evalCount >= 4 && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <ClipboardList className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            This person has <strong>{evalCount}</strong> evaluations on record. Review the{' '}
            <strong>Evaluations</strong> tab for longitudinal context before your next visit.
          </p>
        </div>
      )}
    </div>
  );
}
