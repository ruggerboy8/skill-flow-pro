import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ConfPerfDelta from '@/components/ConfPerfDelta';

type CalibrationRow = {
  domain_name: string;
  mean_conf: number | null;
  mean_perf: number | null;
  mean_delta: number | null;
  label: 'under-confident' | 'over-confident' | 'well-calibrated' | 'Not enough data';
};

type CalibrationData = CalibrationRow[];

interface CalibrationPanelProps {
  data: CalibrationData | null;
  loading: boolean;
}

export default function CalibrationPanel({ data, loading }: CalibrationPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>How does my confidence compare with my performance?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>How does my confidence compare with my performance?</CardTitle>  
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No calibration data available yet. Complete some weeks with both confidence and performance scores!</p>
        </CardContent>
      </Card>
    );
  }

  const getBadgeVariant = (label: string) => {
    switch (label) {
      case 'well-calibrated': return 'default';
      case 'under-confident': return 'secondary';
      case 'over-confident': return 'secondary';
      default: return 'outline';
    }
  };

  const generateNarrative = () => {
    const validDomains = data.filter(d => d.label !== 'Not enough data' && d.mean_delta !== null);
    if (validDomains.length === 0) return "Not enough data to assess calibration yet.";
    
    const significantMisalignments = validDomains.filter(d => Math.abs(d.mean_delta!) >= 0.5);
    
    if (significantMisalignments.length === 0) {
      return "Overall calibration looks well-balanced across domains.";
    }
    
    const underConfident = significantMisalignments.filter(d => d.mean_delta! >= 0.5);
    const overConfident = significantMisalignments.filter(d => d.mean_delta! <= -0.5);
    
    if (underConfident.length > 0 && overConfident.length === 0) {
      return `Overall calibration looks well-balanced; slight under-confidence in ${underConfident.map(d => d.domain_name).join(', ')}.`;
    } else if (overConfident.length > 0 && underConfident.length === 0) {
      return `Overall calibration looks well-balanced; slight over-confidence in ${overConfident.map(d => d.domain_name).join(', ')}.`;
    } else {
      return `Mixed calibration: under-confident in ${underConfident.map(d => d.domain_name).join(', ')}, over-confident in ${overConfident.map(d => d.domain_name).join(', ')}.`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How does my confidence compare with my performance?</CardTitle>
        <div className="text-xs text-muted-foreground">Last 6 weeks</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Domain Rows */}
        <div className="space-y-3">
          {data.map((row) => (
            <div key={row.domain_name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm w-20">{row.domain_name}</span>
                {row.mean_conf !== null && row.mean_perf !== null ? (
                  <ConfPerfDelta 
                    confidence={row.mean_conf} 
                    performance={row.mean_perf} 
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
              <Badge variant={getBadgeVariant(row.label)} className="capitalize">
                {row.label.replace('-', ' ')}
              </Badge>
            </div>
          ))}
        </div>

        {/* Empty state notes for individual domains */}
        {data.some(row => row.label === 'Not enough data') && (
          <div className="text-xs text-muted-foreground">
            * Not enough data domains need more weeks with both confidence and performance scores
          </div>
        )}

        {/* Narrative */}
        <div className="text-sm text-muted-foreground">
          {generateNarrative()}
        </div>
      </CardContent>
    </Card>
  );
}