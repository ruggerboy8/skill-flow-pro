import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getDomainColorRich } from '@/lib/domainColors';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import { 
  calcRate, 
  formatMean,
  type EvalDistributionRow 
} from '@/types/evalMetricsV2';

interface LocationDomainDistributionProps {
  data: EvalDistributionRow[];
}

interface DomainData {
  name: string;
  obsMean: number | null;
  selfMean: number | null;
  distribution: {
    one: number;
    two: number;
    three: number;
    four: number;
    total: number;
  };
}

export function LocationDomainDistribution({ data }: LocationDomainDistributionProps) {
  const domainData = aggregateDomainData(data);

  if (domainData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Domain Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No domain data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Domain Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {domainData.map((domain) => (
            <DomainChart key={domain.name} domain={domain} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DomainChart({ domain }: { domain: DomainData }) {
  const { distribution, obsMean, selfMean } = domain;
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
      
      {/* Obs/Self Averages */}
      <div className="flex justify-between mt-2 pt-2 border-t text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Obs:</span>
          <span className={`font-semibold ${getScoreColor(obsMean)}`}>
            {formatMean(obsMean)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Self:</span>
          <span className={`font-semibold ${getScoreColor(selfMean)}`}>
            {formatMean(selfMean)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DomainHeader({ name }: { name: string }) {
  const domainColor = getDomainColorRich(name);
  
  return (
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
  );
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 3.0) return 'text-green-600';
  if (score >= 2.5) return 'text-amber-600';
  return 'text-red-600';
}

function aggregateDomainData(rows: EvalDistributionRow[]): DomainData[] {
  const domainMap = new Map<string, {
    obsSum: number;
    selfSum: number;
    obsCount: number;
    selfCount: number;
    obs1: number;
    obs2: number;
    obs3: number;
    obs4: number;
    total: number;
  }>();

  for (const row of rows) {
    if (!domainMap.has(row.domain_name)) {
      domainMap.set(row.domain_name, {
        obsSum: 0,
        selfSum: 0,
        obsCount: 0,
        selfCount: 0,
        obs1: 0,
        obs2: 0,
        obs3: 0,
        obs4: 0,
        total: 0
      });
    }

    const domain = domainMap.get(row.domain_name)!;
    domain.total += row.n_items;
    
    // Calculate individual score counts
    const rowObs4 = row.obs_top_box;
    const rowObs12 = row.obs_bottom_box;
    const rowObs1 = Math.floor(rowObs12 / 2);
    const rowObs2 = rowObs12 - rowObs1;
    const rowObs3 = row.n_items - rowObs4 - rowObs12;
    
    domain.obs1 += rowObs1;
    domain.obs2 += rowObs2;
    domain.obs3 += rowObs3;
    domain.obs4 += rowObs4;
    
    if (row.obs_mean !== null) {
      domain.obsSum += row.obs_mean * row.n_items;
      domain.obsCount += row.n_items;
    }
    if (row.self_mean !== null) {
      domain.selfSum += row.self_mean * row.n_items;
      domain.selfCount += row.n_items;
    }
  }

  const result: DomainData[] = [];
  
  for (const [name, d] of domainMap) {
    result.push({
      name,
      obsMean: d.obsCount > 0 ? d.obsSum / d.obsCount : null,
      selfMean: d.selfCount > 0 ? d.selfSum / d.selfCount : null,
      distribution: {
        one: d.obs1,
        two: d.obs2,
        three: d.obs3,
        four: d.obs4,
        total: d.total
      }
    });
  }

  result.sort((a, b) => getDomainOrderIndex(a.name) - getDomainOrderIndex(b.name));
  
  return result;
}
