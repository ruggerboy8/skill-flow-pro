import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { cn } from '@/lib/utils';

const DOMAINS = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'] as const;
type Domain = typeof DOMAINS[number];

interface SkillGapRow {
  action_id: number;
  domain_name: string;
  avg_confidence: number;
}

interface LocationDomainData {
  locationId: string;
  locationName: string;
  domainAvgs: Partial<Record<Domain, number>>;
}

interface DomainConfidenceHeatmapProps {
  locationIds: string[];
  locationNames: Record<string, string>;
  lookbackWeeks?: number;
}

function scoreColor(avg: number | undefined): string {
  if (avg === undefined) return 'text-muted-foreground';
  if (avg >= 3.0) return 'text-emerald-700 dark:text-emerald-400';
  if (avg >= 2.5) return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

function scoreBg(avg: number | undefined): string {
  if (avg === undefined) return '';
  if (avg >= 3.0) return 'bg-emerald-50 dark:bg-emerald-950/20';
  if (avg >= 2.5) return 'bg-amber-50 dark:bg-amber-950/20';
  return 'bg-rose-50 dark:bg-rose-950/20';
}

export function DomainConfidenceHeatmap({ locationIds, locationNames, lookbackWeeks = 6 }: DomainConfidenceHeatmapProps) {
  const [locationData, setLocationData] = useState<LocationDomainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locationIds.length === 0) {
      setLocationData([]);
      setLoading(false);
      return;
    }

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          locationIds.map(async (locId) => {
            const { data, error: err } = await supabase.rpc('get_location_skill_gaps', {
              p_location_id: locId,
              p_lookback_weeks: lookbackWeeks,
              p_limit_per_role: 100, // Get all to compute domain averages
            });
            if (err) throw err;
            return { locId, rows: (data || []) as SkillGapRow[] };
          })
        );

        const locData: LocationDomainData[] = results.map(({ locId, rows }) => {
          const byDomain = new Map<string, { sum: number; count: number }>();
          rows.forEach(row => {
            if (!row.domain_name) return;
            const existing = byDomain.get(row.domain_name) ?? { sum: 0, count: 0 };
            existing.sum += row.avg_confidence;
            existing.count += 1;
            byDomain.set(row.domain_name, existing);
          });

          const domainAvgs: Partial<Record<Domain, number>> = {};
          DOMAINS.forEach(domain => {
            const entry = byDomain.get(domain);
            if (entry) {
              domainAvgs[domain] = parseFloat((entry.sum / entry.count).toFixed(2));
            }
          });

          return {
            locationId: locId,
            locationName: locationNames[locId] || locId,
            domainAvgs,
          };
        });

        setLocationData(locData);
      } catch (err: any) {
        setError(err.message || 'Failed to load domain data');
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [locationIds.join(','), lookbackWeeks]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Domain Confidence by Location</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Domain Confidence by Location</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error loading domain data</p>
        </CardContent>
      </Card>
    );
  }

  if (locationData.length === 0) {
    return null;
  }

  // Compute group averages per domain
  const groupAvgs: Partial<Record<Domain, number>> = {};
  DOMAINS.forEach(domain => {
    const values = locationData.map(l => l.domainAvgs[domain]).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      groupAvgs[domain] = parseFloat((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2));
    }
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-base">Domain Confidence by Location</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Self-reported confidence averages · {lookbackWeeks}-week lookback · ≥3.0 good · 2.5–2.9 watch · &lt;2.5 needs attention
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-32 sticky left-0 z-10 bg-card after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-border">Domain</th>
              {locationData.map(loc => (
                <th key={loc.locationId} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[80px] border-b border-border">
                  <span className="text-xs">{loc.locationName}</span>
                </th>
              ))}
              <th className="text-center py-2 px-2 font-semibold text-foreground min-w-[80px] border-b border-border">
                <span className="text-xs">Group Avg</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((domain, i) => (
              <tr key={domain}>
                <td className={cn(
                  'py-2 pr-4 sticky left-0 z-10 bg-card after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-border',
                  i < DOMAINS.length - 1 && 'border-b border-border'
                )}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getDomainColor(domain) }}
                    />
                    <span className="font-medium text-xs whitespace-nowrap">{domain}</span>
                  </div>
                </td>
                {locationData.map(loc => {
                  const avg = loc.domainAvgs[domain];
                  return (
                    <td key={loc.locationId} className={cn('text-center py-2 px-2 rounded', scoreBg(avg))}>
                      {avg !== undefined ? (
                        <span className={cn('font-semibold text-sm', scoreColor(avg))}>
                          {avg.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                <td className={cn('text-center py-2 px-2 rounded font-bold', scoreBg(groupAvgs[domain]))}>
                  {groupAvgs[domain] !== undefined ? (
                    <span className={cn('text-sm font-bold', scoreColor(groupAvgs[domain]))}>
                      {groupAvgs[domain]!.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
