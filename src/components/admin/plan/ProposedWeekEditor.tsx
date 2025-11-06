import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { SimpleProMovePicker } from './SimpleProMovePicker';
import { Edit2, Save, X, Clock } from 'lucide-react';

interface ProposedWeekEditorProps {
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
}

export function ProposedWeekEditor({ roleId, weekStartDate, onRefresh }: ProposedWeekEditorProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState<PlanRow[]>([]);

  useEffect(() => {
    loadProposedWeek();
  }, [roleId, weekStartDate]);

  const loadProposedWeek = async () => {
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
          pro_moves!inner(action_statement, competencies!inner(domains!inner(domain_name)))
        `)
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', weekStartDate)
        .eq('status', 'proposed')
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
        rank_version: row.rank_version
      })) || [];

      setRows(formatted);
      setEditedRows(formatted);
    } catch (error: any) {
      console.error('[ProposedWeekEditor] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditedRows([...rows]);
    setEditMode(true);
  };

  const handleCancel = () => {
    setEditedRows([...rows]);
    setEditMode(false);
  };

  const handleActionChange = (index: number, actionId: number, actionStatement: string, domainName: string) => {
    const updated = [...editedRows];
    updated[index] = {
      ...updated[index],
      action_id: actionId,
      action_statement: actionStatement,
      domain_name: domainName
    };
    setEditedRows(updated);
  };

  const handleSave = async () => {
    try {
      // Fetch original rows to preserve rank provenance
      const { data: originalRows, error: fetchError } = await supabase
        .from('weekly_plan')
        .select('id, rank_version, rank_snapshot')
        .in('id', editedRows.map(r => r.id));

      if (fetchError) throw fetchError;

      // Update rows in place, preserving rank_version and rank_snapshot
      for (const row of editedRows) {
        const original = originalRows?.find(o => o.id === row.id);
        
        const { error } = await supabase
          .from('weekly_plan')
          .update({
            action_id: row.action_id,
            generated_by: 'manual',
            overridden: true,
            overridden_at: new Date().toISOString(),
            // CRITICAL: Preserve original rank provenance
            rank_version: original?.rank_version || null,
            rank_snapshot: original?.rank_snapshot || null,
          })
          .eq('id', row.id);

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Proposed week updated and marked as overridden. Original rank provenance preserved.'
      });

      setEditMode(false);
      loadProposedWeek();
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
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
        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No proposed week found for {weekStartDate}</p>
        <p className="text-sm mt-1">Use Sequencer Controls (Dev) to generate a proposed week</p>
      </div>
    );
  }

  const isSequencerGenerated = rows.every(r => r.generated_by === 'auto');
  const isManualOverride = rows.some(r => r.generated_by === 'manual');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Edit2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Editable proposed assignments</span>
          {isSequencerGenerated && (
            <Badge variant="default">🤖 Sequencer-Generated</Badge>
          )}
          {isManualOverride && (
            <Badge variant="secondary">✏️ Manually Overridden</Badge>
          )}
        </div>
        {!editMode ? (
          <Button onClick={handleEdit} size="sm">
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleCancel} size="sm" variant="outline">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} size="sm">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Pro-Move</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(editMode ? editedRows : rows).map((row, index) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-sm">{row.display_order}</TableCell>
              <TableCell>
                {editMode ? (
                  <SimpleProMovePicker
                    roleId={roleId}
                    selectedId={row.action_id}
                    onSelect={(actionId, actionStatement, domainName) => 
                      handleActionChange(index, actionId, actionStatement, domainName)
                    }
                  />
                ) : (
                  <span className="font-medium">{row.action_statement}</span>
                )}
              </TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
