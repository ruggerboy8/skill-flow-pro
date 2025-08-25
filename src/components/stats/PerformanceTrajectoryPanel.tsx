import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor } from '@/lib/domainColors';

type TrendPoint = { week_key: string; value: number };
type DomainTrend = { domain_name: string; points: TrendPoint[]; slope: number; label: string };
type TrajectoryData = DomainTrend[];

interface PerformanceTrajectoryPanelProps {
  data: TrajectoryData | null;
  loading: boolean;
}

// Simple sparkline component
function Sparkline({ points }: { points: TrendPoint[] }) {
  if (!points || points.length < 2) {
    return <div className="w-24 h-8 bg-gray-100 rounded" />;
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
      <span className="text-sm font-medium">{lastPoint.value}</span>
    </div>
  );
}

export default function PerformanceTrajectoryPanel({ data, loading }: PerformanceTrajectoryPanelProps) {
  if (loading) {
    return (
      <Card>
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
      <Card>
        <CardHeader>
          <CardTitle>How am I performing in each domain?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No performance data available yet. Complete some weeks to see your trajectory!</p>
        </CardContent>
      </Card>
    );
  }

  const getTrendVariant = (label: string) => {
    switch (label) {
      case 'Improving': return 'default';
      case 'Declining': return 'destructive';
      case 'Holding steady': return 'secondary';
      default: return 'outline';
    }
  };

  const generateNarrative = () => {
    const validTrends = data.filter(d => d.label !== 'Not enough data');
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
    <Card>
      <CardHeader>
        <CardTitle>How am I performing in each domain?</CardTitle>
        <div className="text-xs text-muted-foreground">Last 6 weeks</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4">
          {data.map((domain) => (
            <div 
              key={domain.domain_name}
              className="p-3 rounded-lg border"
              style={{ backgroundColor: getDomainColor(domain.domain_name) }}
            >
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-slate-800">{domain.domain_name}</h4>
                <Sparkline points={domain.points} />
                <Badge variant={getTrendVariant(domain.label)} className="text-xs">
                  {domain.label}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Narrative */}
        <div className="text-sm text-muted-foreground">
          {generateNarrative()}
        </div>
      </CardContent>
    </Card>
  );
}