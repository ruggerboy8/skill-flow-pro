import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp } from 'lucide-react';
import { getDomainColorRich } from '@/lib/domainColors';
import { formatMean } from '@/types/evalMetricsV2';

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
  
  const segments = [
    { score: 1, count: one, percent: p1, color: 'bg-red-500', hoverColor: 'hover:bg-red-600' },
    { score: 2, count: two, percent: p2, color: 'bg-orange-400', hoverColor: 'hover:bg-orange-500' },
    { score: 3, count: three, percent: p3, color: 'bg-amber-300', hoverColor: 'hover:bg-amber-400' },
    { score: 4, count: four, percent: p4, color: 'bg-green-500', hoverColor: 'hover:bg-green-600' },
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
                    className={`${seg.color} ${seg.hoverColor} transition-colors cursor-default`}
                    style={{ width: `${seg.percent}%` }}
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
            <span className="text-[10px] font-medium text-muted-foreground">{seg.score}</span>
            <span className="text-[10px] text-muted-foreground block">{seg.percent}%</span>
          </div>
        ))}
      </div>
      
    </div>
  );
}

function DomainHeader({ name, avg }: { name: string; avg: number | null }) {
  const domainColor = getDomainColorRich(name);
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
        <span className={`text-sm font-bold ${avgColor}`}>
          {formatMean(avg)}
        </span>
      )}
    </div>
  );
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 3.0) return 'text-green-600';
  if (score >= 2.5) return 'text-amber-600';
  return 'text-red-600';
}
