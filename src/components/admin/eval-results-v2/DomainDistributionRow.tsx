import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp } from 'lucide-react';
import { getDomainColorVar } from '@/lib/domainColors';
import { formatMean } from '@/types/evalMetricsV2';
import { scoreBucket, scoreBucketTokens } from '@/lib/confidenceScoreRamp';

interface DomainDistribution {
  name: string;
  avg: number;
  distribution: {
    one: number;
    two: number;
    three: number;
    four: number;
    total: number;
  };
}

interface DomainDistributionRowProps {
  domainData: DomainDistribution[];
  staffCount?: number;
}

export function DomainDistributionRow({ domainData, staffCount }: DomainDistributionRowProps) {
  if (domainData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-medium">Performance</span>
          {staffCount !== undefined && staffCount > 0 && (
            <span className="text-xs text-muted-foreground">
              · {staffCount} staff evaluated
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {domainData.map((domain) => (
            <DomainChart key={domain.name} domain={domain} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DomainChart({ domain }: { domain: DomainDistribution }) {
  const { distribution, avg } = domain;
  const { one, two, three, four, total } = distribution;
  
  if (total === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        <DomainHeader name={domain.name} avg={null} />
        <div className="mt-2">No data</div>
      </div>
    );
  }
  
  const p1 = Math.round((one / total) * 100);
  const p2 = Math.round((two / total) * 100);
  const p3 = Math.round((three / total) * 100);
  const p4 = Math.round((four / total) * 100);
  
  // DSN-3 slice 3: 1-4 rating distribution bar → --score-1..4, DASH-1a
  // ramp (band 1 shifts red → orange, same intentional hue change flagged
  // elsewhere in this migration). Solid-fill segments, so the vivid token
  // is fine — no text-on-tint contrast concern. The tokens have no darker
  // "hover" shade, so the per-segment darken-on-hover is replaced with a
  // simple opacity dim instead of dropping the hover affordance entirely.
  const segments = [
    { score: 1, count: one, percent: p1, color: 'hsl(var(--score-1))' },
    { score: 2, count: two, percent: p2, color: 'hsl(var(--score-2))' },
    { score: 3, count: three, percent: p3, color: 'hsl(var(--score-3))' },
    { score: 4, count: four, percent: p4, color: 'hsl(var(--score-4))' },
  ];

  return (
    <div>
      <DomainHeader name={domain.name} avg={avg} />
      
      {/* Distribution Bar */}
      <TooltipProvider delayDuration={0}>
        <div className="flex h-5 w-full rounded-md overflow-hidden mt-2">
          {segments.map((seg) => (
            seg.percent > 0 && (
              <Tooltip key={seg.score}>
                <TooltipTrigger asChild>
                  <div
                    className="transition-opacity hover:opacity-80 cursor-default"
                    style={{ width: `${seg.percent}%`, backgroundColor: seg.color }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-center">
                  <p className="font-medium">Score {seg.score}</p>
                  <p className="text-xs text-muted-foreground">
                    {seg.count} ratings ({seg.percent}%)
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          ))}
        </div>
      </TooltipProvider>
      
      {/* Score Labels + Percentages combined row */}
      <div className="flex justify-between mt-1.5 px-0.5">
        {segments.map((seg) => (
          <div key={seg.score} className="text-center w-6">
            <span className="text-2xs font-medium text-muted-foreground">{seg.score}</span>
            <span className="text-2xs text-muted-foreground block">{seg.percent}%</span>
          </div>
        ))}
      </div>
      
    </div>
  );
}

function DomainHeader({ name, avg }: { name: string; avg: number | null }) {
  const domainColor = getDomainColorVar(name);
  const avgColor = getScoreColor(avg);

  return (
    <div className="flex items-center justify-between">
      <div
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{
          backgroundColor: domainColor + '20',
          borderLeft: `3px solid ${domainColor}`,
          color: '#000'
        }}
      >
        {name}
      </div>
      {avg !== null && (
        <span className="text-sm font-bold" style={{ color: avgColor }}>
          {formatMean(avg)}
        </span>
      )}
    </div>
  );
}

// DSN-3 slice 3: reuses the DASH-1a scoreBucket() ramp instead of a
// hand-rolled red/amber/green traffic light — same fix slice 2 applied to
// LocationSkillGaps.tsx/StaffOverviewTab.tsx/StaffDetailV2.tsx. NOT a pure
// recolor: the old cutoffs were >=3.0 green / >=2.5 amber / else red;
// scoreBucket() buckets [3,4) into --score-3 (BLUE, not green — green is
// reserved for a full 4.0) and moves the low-tier line from 2.5 to 2.0. A
// domain averaging 2.6-2.9 used to read amber and now reads --score-2
// (still amber, no change); a domain averaging 3.0-3.9 used to read green
// and now reads --score-3's blue. This is the same documented behavior
// change as the token-migration doc's section 7 finding, applied to a new
// call site — not a bug.
function getScoreColor(score: number | null): string {
  const tokens = scoreBucketTokens(scoreBucket(score ?? NaN));
  return tokens.text;
}
