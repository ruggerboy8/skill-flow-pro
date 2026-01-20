import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { 
  calcRate, 
  formatRate, 
  formatMean,
  getTopBoxColor,
  getMismatchColor,
  type EvalDistributionRow,
  type DomainRow
} from '@/types/evalMetricsV2';
import { cn } from '@/lib/utils';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import { getDomainColor } from '@/lib/domainColors';

interface DomainSnapshotTableProps {
  data: EvalDistributionRow[];
}

export function DomainSnapshotTable({ data }: DomainSnapshotTableProps) {
  const domainRows = aggregateByDomain(data);

  if (domainRows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No domain data available
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Domain</TableHead>
          <TableHead className="text-center">Scored 1-2</TableHead>
          <TableHead className="text-center">Scored 4</TableHead>
          <TableHead className="text-center">% Misaligned</TableHead>
          <TableHead className="text-center">Obs Avg</TableHead>
          <TableHead className="text-center">Self Avg</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {domainRows.map((domain) => {
          const isLowN = domain.nItems < 5;
          
          return (
            <TableRow key={domain.domainId}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span 
                    className="inline-block w-2 h-2 rounded-full" 
                    style={{ backgroundColor: getDomainColor(domain.domainName) }}
                  />
                  {domain.domainName}
                  {isLowN && (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {formatRate(domain.bottomBoxRate)}
              </TableCell>
              <TableCell className={cn("text-center font-medium", getTopBoxColor(domain.topBoxRate))}>
                {formatRate(domain.topBoxRate)}
              </TableCell>
              <TableCell className={cn("text-center font-medium", getMismatchColor(domain.mismatchRate))}>
                {formatRate(domain.mismatchRate)}
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {formatMean(domain.obsMean)}
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {formatMean(domain.selfMean)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function aggregateByDomain(rows: EvalDistributionRow[]): DomainRow[] {
  const domainMap = new Map<number, {
    domainName: string;
    nItems: number;
    obsTopBox: number;
    obsBottomBox: number;
    mismatchCount: number;
    obsSum: number;
    selfSum: number;
    obsCount: number;
    selfCount: number;
  }>();

  for (const row of rows) {
    if (!domainMap.has(row.domain_id)) {
      domainMap.set(row.domain_id, {
        domainName: row.domain_name,
        nItems: 0,
        obsTopBox: 0,
        obsBottomBox: 0,
        mismatchCount: 0,
        obsSum: 0,
        selfSum: 0,
        obsCount: 0,
        selfCount: 0
      });
    }

    const domain = domainMap.get(row.domain_id)!;
    domain.nItems += row.n_items;
    domain.obsTopBox += row.obs_top_box;
    domain.obsBottomBox += row.obs_bottom_box;
    domain.mismatchCount += row.mismatch_count;
    
    if (row.obs_mean !== null) {
      domain.obsSum += row.obs_mean * row.n_items;
      domain.obsCount += row.n_items;
    }
    if (row.self_mean !== null) {
      domain.selfSum += row.self_mean * row.n_items;
      domain.selfCount += row.n_items;
    }
  }

  const result: DomainRow[] = [];
  
  for (const [domainId, d] of domainMap) {
    result.push({
      domainId,
      domainName: d.domainName,
      topBoxRate: calcRate(d.obsTopBox, d.nItems),
      bottomBoxRate: calcRate(d.obsBottomBox, d.nItems),
      mismatchRate: calcRate(d.mismatchCount, d.nItems),
      obsMean: d.obsCount > 0 ? d.obsSum / d.obsCount : null,
      selfMean: d.selfCount > 0 ? d.selfSum / d.selfCount : null,
      nItems: d.nItems
    });
  }

  // Sort by canonical domain order
  result.sort((a, b) => getDomainOrderIndex(a.domainName) - getDomainOrderIndex(b.domainName));
  
  return result;
}
