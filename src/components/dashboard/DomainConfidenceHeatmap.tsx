import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { scoreBucket, scoreBucketTokens, isTrailingCell } from '@/lib/confidenceScoreRamp';
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

// DASH-1a: confidence scores use the 1-4 score ramp (a learning gradient),
// never a traffic light. See src/lib/confidenceScoreRamp.ts.
function scoreCellStyle(avg: number | undefined): React.CSSProperties {
  if (avg === undefined) return {};
  const tokens = scoreBucketTokens(scoreBucket(avg));
  return { backgroundColor: tokens.bg };
}

function scoreTextStyle(avg: number | undefined): React.CSSProperties {
  if (avg === undefined) return {};
  const tokens = scoreBucketTokens(scoreBucket(avg));
  return { color: tokens.text };
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
            1 to 4 self-rated confidence, higher is more confident · {lookbackWeeks}-week lookback
          </p>
          <p className="text-2xs text-muted-foreground/80 mt-1 flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: 'hsl(var(--muted-foreground))' }}
            />
            Marked cells trail their row's group average by 0.5 or more
          </p>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-32">Domain</th>
              {locationData.map(loc => (
                <th key={loc.locationId} className="text-center py-2 px-2 font-medium text-muted-foreground min-w-[80px]">
                  <span className="text-xs">{loc.locationName}</span>
                </th>
              ))}
              <th className="text-center py-2 px-2 font-semibold text-foreground min-w-[80px]">
                <span className="text-xs">Group Avg</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((domain, i) => (
              <tr key={domain} className={cn(i < DOMAINS.length - 1 && 'border-b border-border')}>
                <td className="py-2 pr-4">
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
                  const groupAvg = groupAvgs[domain];
                  const trailing = avg !== undefined && groupAvg !== undefined && isTrailingCell(avg, groupAvg);
                  return (
                    <td key={loc.locationId} className="text-center py-2 px-2" style={scoreCellStyle(avg)}>
                      {avg !== undefined ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-semibold text-sm" style={scoreTextStyle(avg)}>
                            {avg.toFixed(1)}
                          </span>
                          {trailing && (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: 'hsl(var(--muted-foreground))' }}
                              title="Trails this row's group average by 0.5 or more"
                            />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center py-2 px-2 font-bold" style={scoreCellStyle(groupAvgs[domain])}>
                  {groupAvgs[domain] !== undefined ? (
                    <span className="text-sm font-bold" style={scoreTextStyle(groupAvgs[domain])}>
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
