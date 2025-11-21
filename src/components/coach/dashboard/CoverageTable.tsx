import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import type { StaffStatus } from '@/hooks/useCoachStaffStatuses';

interface CoverageTableProps {
  rows: StaffStatus[];
  loading: boolean;
  onNavigate: (staffId: string) => void;
  onSendReminder: (type: 'confidence' | 'performance') => void;
}

export function CoverageTable({ rows, loading, onNavigate, onSendReminder }: CoverageTableProps) {
  const sortedRows = useMemo(() => {
    const enriched = rows.map((status) => ({
      ...status,
      conf_submitted: status.conf_count >= status.required_count,
      perf_submitted: status.perf_count >= status.required_count,
    }));

    return enriched.sort((a, b) => {
      const aPriority = !a.conf_submitted && !a.perf_submitted ? 0 : !a.conf_submitted ? 1 : !a.perf_submitted ? 2 : 3;
      const bPriority = !b.conf_submitted && !b.perf_submitted ? 0 : !b.conf_submitted ? 1 : !b.perf_submitted ? 2 : 3;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [rows]);

  const missingConfCount = sortedRows.filter((r) => !r.conf_submitted).length;
  const missingPerfCount = sortedRows.filter((r) => !r.perf_submitted).length;

  const formatLastActivity = (row: StaffStatus) => {
    if (row.last_activity_at && row.last_activity_kind) {
      const date = format(new Date(row.last_activity_at), 'MMM d');
      const type = row.last_activity_kind === 'confidence' ? 'Conf' : 'Perf';
      return `${type} · ${date}`;
    }
    return '—';
  };

  function StatusCell({ submitted, type }: { submitted: boolean; type: string }) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center justify-center">
              {submitted ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <X className="h-5 w-5 text-red-600" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>{submitted ? `${type} submitted` : `${type} missing`}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Staff Coverage</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={missingConfCount === 0}
              onClick={() => onSendReminder('confidence')}
            >
              Reminder: Confidence ({missingConfCount})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={missingPerfCount === 0}
              onClick={() => onSendReminder('performance')}
            >
              Reminder: Performance ({missingPerfCount})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No staff match the selected filters</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-center">Confidence</TableHead>
                <TableHead className="text-center">Performance</TableHead>
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
                  <TableCell>{row.location_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatLastActivity(row)}</TableCell>
                  <TableCell className="text-center">
                    <StatusCell submitted={row.conf_submitted} type="confidence" />
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusCell submitted={row.perf_submitted} type="performance" />
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
