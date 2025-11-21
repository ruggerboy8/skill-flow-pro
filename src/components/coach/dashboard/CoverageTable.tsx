import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { StaffStatus } from '@/hooks/useCoachStaffStatuses';

export interface CoverageTableProps {
  rows: StaffStatus[];
  loading: boolean;
  weekOf?: Date;
  onNavigate: (staffId: string) => void;
  onSendReminder: (type: 'confidence' | 'performance') => void;
}

function StatusCell({ submitted, type }: { submitted: boolean; type: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center justify-center gap-2">
            {submitted ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <X className="h-5 w-5 text-red-600" />
            )}
            {!submitted && (
              <Badge variant="destructive" className="text-xs">
                Missing
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{submitted ? `${type} submitted` : `${type} missing`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CoverageTable({ rows, loading, weekOf, onNavigate, onSendReminder }: CoverageTableProps) {
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aMissingPerformance = a.perf_submitted_count < a.required_count;
      const bMissingPerformance = b.perf_submitted_count < b.required_count;
      if (aMissingPerformance !== bMissingPerformance) {
        return aMissingPerformance ? -1 : 1;
      }

      const aMissingConfidence = a.conf_submitted_count < a.required_count;
      const bMissingConfidence = b.conf_submitted_count < b.required_count;
      if (aMissingConfidence !== bMissingConfidence) {
        return aMissingConfidence ? -1 : 1;
      }

      const aMissingTotal = a.required_count - a.conf_submitted_count + (a.required_count - a.perf_submitted_count);
      const bMissingTotal = b.required_count - b.conf_submitted_count + (b.required_count - b.perf_submitted_count);
      if (aMissingTotal !== bMissingTotal) {
        return bMissingTotal - aMissingTotal;
      }

      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [rows]);

  const missingConfidence = useMemo(() => sortedRows.filter((row) => row.conf_submitted_count < row.required_count).length, [sortedRows]);
  const missingPerformance = useMemo(
    () => sortedRows.filter((row) => row.perf_submitted_count < row.required_count).length,
    [sortedRows]
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Staff Coverage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sorted by most critical missing submissions first.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={missingConfidence === 0}
              onClick={() => onSendReminder('confidence')}
            >
              Confidence reminders ({missingConfidence})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={missingPerformance === 0}
              onClick={() => onSendReminder('performance')}
            >
              Performance reminders ({missingPerformance})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedRows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No staff match the selected filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">Confidence</TableHead>
                <TableHead className="text-center">Performance</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={row.staff_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onNavigate(row.staff_id)}
                >
                  <TableCell className="font-medium">{row.staff_name}</TableCell>
                  <TableCell>{row.role_name}</TableCell>
                  <TableCell>{row.organization_name}</TableCell>
                  <TableCell>{row.location_name}</TableCell>
                  <TableCell className="text-center">
                    <StatusCell submitted={row.conf_submitted_count >= row.required_count} type="Confidence" />
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusCell submitted={row.perf_submitted_count >= row.required_count} type="Performance" />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.last_conf_at || row.last_perf_at
                      ? (() => {
                          const confTime = row.last_conf_at ? new Date(row.last_conf_at).getTime() : 0;
                          const perfTime = row.last_perf_at ? new Date(row.last_perf_at).getTime() : 0;
                          const latest = confTime > perfTime ? row.last_conf_at : row.last_perf_at;
                          const type = confTime > perfTime ? 'Conf' : 'Perf';
                          return `${type} · ${format(new Date(latest!), 'MMM d')}`;
                        })()
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
