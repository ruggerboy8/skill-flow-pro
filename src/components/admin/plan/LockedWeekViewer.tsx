import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';

interface LockedWeekViewerProps {
  roleId: number;
  weekStartDate: string;
  onRefresh?: () => void;
}

interface PlanRow {
  id: number;
  display_order: number;
  action_id: number;
  action_statement: string;
  domain_name: string;
  status: string;
  generated_by: string;
  overridden: boolean;
  rank_version: string | null;
  locked_at: string | null;
}

export function LockedWeekViewer({ roleId, weekStartDate }: LockedWeekViewerProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PlanRow[]>([]);

  useEffect(() => {
    loadLockedWeek();
  }, [roleId, weekStartDate]);

  const loadLockedWeek = async () => {
    setLoading(true);
    try {
      const { data: planData, error } = await supabase
        .from('weekly_plan')
        .select(`
          id,
          display_order,
          action_id,
          status,
          generated_by,
          overridden,
          rank_version,
          locked_at,
          pro_moves(action_statement, competencies(domains!competencies_domain_id_fkey(domain_name)))
        `)
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', weekStartDate)
        .eq('status', 'locked')
        .order('display_order');

      if (error) throw error;

      const formatted = planData?.map((row: any) => ({
        id: row.id,
        display_order: row.display_order,
        action_id: row.action_id,
        action_statement: row.pro_moves?.action_statement || 'Unknown',
        domain_name: row.pro_moves?.competencies?.domains?.domain_name || 'Unknown',
        status: row.status,
        generated_by: row.generated_by,
        overridden: row.overridden,
        rank_version: row.rank_version,
        locked_at: row.locked_at
      })) || [];

      setRows(formatted);
    } catch (error: any) {
      console.error('[LockedWeekViewer] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Lock className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No locked week found for {weekStartDate}</p>
        <p className="text-sm mt-1">This week hasn't been locked yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span>Read-only view of locked assignments</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Pro-Move</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-sm">{row.display_order}</TableCell>
              <TableCell className="font-medium">{row.action_statement}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.domain_name}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={row.generated_by === 'auto' ? 'default' : 'secondary'}>
                    {row.generated_by === 'auto' ? '🤖 Sequencer' : '✏️ Manual'}
                  </Badge>
                  {row.overridden && (
                    <Badge variant="outline" className="text-xs">
                      Overridden
                    </Badge>
                  )}
                  {row.rank_version && (
                    <span className="text-xs text-muted-foreground">{row.rank_version}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="default">
                  <Lock className="h-3 w-3 mr-1" />
                  Locked
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
