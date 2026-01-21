import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getDomainColorRich } from '@/lib/domainColors';

interface DomainDistribution {
  name: string;
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
}

export function DomainDistributionRow({ domainData }: DomainDistributionRowProps) {
  if (domainData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="text-sm font-medium text-muted-foreground mb-4">
          Score Distribution by Domain
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {domainData.map((domain) => (
            <DomainChart key={domain.name} domain={domain} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DomainChart({ domain }: { domain: DomainDistribution }) {
  const { distribution } = domain;
  const { one, two, three, four, total } = distribution;
  
  if (total === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        <DomainHeader name={domain.name} />
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
      <DomainHeader name={domain.name} />
      
      {/* Distribution Bar */}
      <TooltipProvider delayDuration={0}>
        <div className="flex h-6 w-full rounded-md overflow-hidden mt-3">
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
      
      {/* Score Labels */}
      <div className="flex justify-between mt-2 px-0.5">
        {[1, 2, 3, 4].map((score) => (
          <span key={score} className="text-xs font-medium text-muted-foreground w-6 text-center">
            {score}
          </span>
        ))}
      </div>
      
      {/* Percentage Labels */}
      <div className="flex justify-between px-0.5">
        {segments.map((seg) => (
          <span key={seg.score} className="text-xs text-muted-foreground w-6 text-center">
            {seg.percent}%
          </span>
        ))}
      </div>
      
      {/* Sample Size */}
      <div className="text-center mt-2">
        <span className="text-xs text-muted-foreground">(n={total})</span>
      </div>
    </div>
  );
}

function DomainHeader({ name }: { name: string }) {
  const domainColor = getDomainColorRich(name);
  
  return (
    <div 
      className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium"
      style={{ 
        backgroundColor: domainColor + '20',
        borderLeft: `3px solid ${domainColor}`,
        color: '#000'
      }}
    >
      {name}
    </div>
  );
}
