import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor } from '@/lib/domainColors';

const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

type TrendPoint = { week_key: string; value: number };
type DomainTrend = { domain_name: string; points: TrendPoint[]; slope: number; label: string };
type TrajectoryData = DomainTrend[];

interface PerformanceTrajectoryPanelProps {
  data: TrajectoryData | null;
  loading: boolean;
}

function tryParseCycleWeek(key: string) {
  // supports "1-3", "C1-W3", "Cycle 1 • Week 3", etc. (very tolerant)
  const m = key.match(/(\d+)[^\d]+(\d+)/);
  if (!m) return null;
  return { cycle: Number(m[1]), week: Number(m[2]) };
}

function sortChrono(points: { week_key: string; value: number }[]) {
  if (!points || points.length < 2) return points ?? [];
  const copy = [...points];

  // Prefer cycle-week parsing
  const A = tryParseCycleWeek(copy[0].week_key);
  const B = tryParseCycleWeek(copy[copy.length - 1].week_key);
  if (A && B) {
    return copy.sort((p, q) => {
      const ap = tryParseCycleWeek(p.week_key)!;
      const aq = tryParseCycleWeek(q.week_key)!;
      return ap.cycle === aq.cycle ? ap.week - aq.week : ap.cycle - aq.cycle;
    });
  }

  // Fallback: try Date.parse (if week_key is date-like)
  const d0 = Date.parse(copy[0].week_key);
  const d1 = Date.parse(copy[copy.length - 1].week_key);
  if (!Number.isNaN(d0) && !Number.isNaN(d1)) {
    return copy.sort((p, q) => Date.parse(p.week_key) - Date.parse(q.week_key));
  }

  // Otherwise, leave order as-is
  return copy;
}

function computeTrendLabel(points: { value: number }[]) {
  if (!points || points.length < 2) return 'Not enough data';

  // simple linear regression slope on x = 1..n
  const n = points.length;
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const ys = points.map(p => p.value);
  const meanX = (n + 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  const slope = den === 0 ? 0 : num / den;

  // thresholds: tweak as you like
  if (slope > 0.05) return 'Improving';
  if (slope < -0.05) return 'Declining';
  return 'Holding steady';
}

function orderDomains(data: TrajectoryData) {
  const map = new Map(data.map(d => [d.domain_name, d]));
  const ordered = DOMAIN_ORDER.map(d => map.get(d)).filter(Boolean) as DomainTrend[];
  // append unexpected domains at the end
  for (const d of data) if (!DOMAIN_ORDER.includes(d.domain_name)) ordered.push(d);
  return ordered;
}

// Simple sparkline component
function Sparkline({ points }: { points: TrendPoint[] }) {
  if (!points || points.length < 2) {
    return <div className="w-24 h-8 bg-gray-100 rounded flex items-center justify-center text-[10px] text-muted-foreground">n/a</div>;
  }

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 96; // w-24
  const height = 32; // h-8
  const padding = 4;

  const pathData = points
    .map((point, index) => {
      const x = padding + (index * (width - 2 * padding)) / (points.length - 1);
      const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const lastPoint = points[points.length - 1];
  const lastX = padding + ((points.length - 1) * (width - 2 * padding)) / (points.length - 1);
  const lastY = height - padding - ((lastPoint.value - min) / range) * (height - 2 * padding);

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="border rounded">
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-blue-600"
        />
        <circle
          cx={lastX}
          cy={lastY}
          r="2"
          fill="currentColor"
          className="text-blue-600"
        />
      </svg>
      <span className="text-sm font-medium">{Number(lastPoint.value.toFixed(1))}</span>
    </div>
  );
}

export default function PerformanceTrajectoryPanel({ data, loading }: PerformanceTrajectoryPanelProps) {
  if (loading) {
    return (
      <Card className="ring-1 ring-border/50">
        <CardHeader>
          <CardTitle>How am I performing in each domain?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="ring-1 ring-border/50">
        <CardHeader>
          <CardTitle>How am I performing in each domain?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No performance data available yet. Complete some weeks to see your trajectory!</p>
        </CardContent>
      </Card>
    );
  }

  const ordered = orderDomains(data);

  const getTrendVariant = (label: string) => {
    switch (label) {
      case 'Improving': return 'default';
      case 'Declining': return 'destructive';
      case 'Holding steady': return 'secondary';
      default: return 'outline';
    }
  };

  const generateNarrative = () => {
    const validTrends = ordered.map(domain => {
      const pointsChrono = sortChrono(domain.points);
      const hasEnough = (pointsChrono?.length ?? 0) >= 2;
      const computedLabel = hasEnough ? computeTrendLabel(pointsChrono) : 'Not enough data';
      return { domain_name: domain.domain_name, label: computedLabel };
    }).filter(d => d.label !== 'Not enough data');
    
    if (validTrends.length === 0) return "Not enough data to analyze trends yet.";
    
    const improving = validTrends.filter(d => d.label === 'Improving').map(d => d.domain_name);
    const declining = validTrends.filter(d => d.label === 'Declining').map(d => d.domain_name);
    
    if (improving.length > 0 && declining.length === 0) {
      return `In general, your performance in ${improving.join(', ')} is improving.`;
    } else if (declining.length > 0 && improving.length === 0) {
      return `Your performance in ${declining.join(', ')} is declining.`;
    } else if (improving.length > 0 && declining.length > 0) {
      return `Mixed trends: improving in ${improving.join(', ')}, declining in ${declining.join(', ')}.`;
    } else {
      return "Your performance is holding steady across domains.";
    }
  };

  return (
    <Card className="ring-1 ring-border/50">
      <CardHeader>
        <CardTitle>How am I performing in each domain?</CardTitle>
        <div className="text-xs text-muted-foreground">Last 6 weeks</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4">
          {ordered.map((domain) => {
            const pointsChrono = sortChrono(domain.points);
            const hasEnough = (pointsChrono?.length ?? 0) >= 2;
            const last = pointsChrono?.[pointsChrono.length - 1]?.value ?? null;
            const lastLabel = last != null ? Number(last.toFixed(1)) : '—';

            // compute label on client using chrono order
            const computedLabel = hasEnough ? computeTrendLabel(pointsChrono) : 'Not enough data';

            return (
              <div 
                key={domain.domain_name}
                className="p-3 rounded-lg border ring-1 ring-border/50"
                style={{ backgroundColor: getDomainColor(domain.domain_name) }}
              >
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-slate-800">{domain.domain_name}</h4>
                  <div className="flex items-center justify-between">
                    <Sparkline points={pointsChrono} />
                    <span className="text-sm font-semibold text-slate-900">{lastLabel}</span>
                  </div>
                  <Badge variant={getTrendVariant(computedLabel)} className="text-xs">
                    {computedLabel}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Narrative */}
        <div className="text-sm text-muted-foreground">
          {generateNarrative()}
        </div>
      </CardContent>
    </Card>
  );
}