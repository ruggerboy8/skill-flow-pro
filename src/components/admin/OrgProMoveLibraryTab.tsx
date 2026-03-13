import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, EyeOff, Search } from 'lucide-react';

interface ProMoveRow {
  action_id: number;
  action_statement: string;
  practice_types: string[];
  role_name: string;
  domain_name: string;
  competency_name: string;
  is_hidden: boolean;
}

export function OrgProMoveLibraryTab() {
  const { toast } = useToast();
  const { organizationId } = useUserRole();

  const [rows, setRows] = useState<ProMoveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // 1. Fetch org practice_type
      const { data: orgData, error: orgErr } = await supabase
        .from('organizations')
        .select('practice_type')
        .eq('id', organizationId)
        .maybeSingle();

      if (orgErr) throw orgErr;

      const orgPracticeType = orgData?.practice_type;
      if (!orgPracticeType) {
        toast({
          title: 'Configuration error',
          description: 'Organization practice type is not set. Please contact support.',
          variant: 'destructive',
        });
        setRows([]);
        setLoading(false);
        return;
      }

      // 2. Fetch active pro moves whose practice_types array overlaps the org's type
      const { data: proMoves, error: pmErr } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          practice_types,
          roles!fk_pro_moves_role_id(role_name),
          competencies!fk_pro_moves_competency_id(
            name,
            domains!fk_competencies_domain_id(domain_name)
          )
        `)
        .eq('active', true)
        .overlaps('practice_types', [orgPracticeType])
        .order('action_id');

      if (pmErr) throw pmErr;

      // 3. Fetch existing overrides for this org
      const { data: overrides, error: ovErr } = await (supabase as any)
        .from('organization_pro_move_overrides')
        .select('pro_move_id, is_hidden')
        .eq('org_id', organizationId);

      if (ovErr) throw ovErr;

      const hiddenSet = new Set(
        (overrides ?? []).filter(o => o.is_hidden).map(o => o.pro_move_id)
      );

      const merged: ProMoveRow[] = (proMoves ?? []).map((pm: any) => ({
        action_id: pm.action_id,
        action_statement: pm.action_statement,
        practice_types: pm.practice_types ?? [],
        role_name: pm.roles?.role_name ?? '—',
        domain_name: pm.competencies?.domains?.domain_name ?? '—',
        competency_name: pm.competencies?.name ?? '—',
        is_hidden: hiddenSet.has(pm.action_id),
      }));

      setRows(merged);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load pro move library',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleHidden = async (row: ProMoveRow) => {
    if (!organizationId) return;
    setSavingId(row.action_id);

    // Optimistic update
    setRows(prev =>
      prev.map(r =>
        r.action_id === row.action_id ? { ...r, is_hidden: !r.is_hidden } : r
      )
    );

    try {
      const newHidden = !row.is_hidden;

      const { error } = await (supabase as any)
        .from('organization_pro_move_overrides')
        .upsert(
          {
            org_id: organizationId,
            pro_move_id: row.action_id,
            is_hidden: newHidden,
            hidden_at: newHidden ? new Date().toISOString() : null,
          },
          { onConflict: 'org_id,pro_move_id' }
        );

      if (error) throw error;
    } catch (err: any) {
      // Revert optimistic update on error
      setRows(prev =>
        prev.map(r =>
          r.action_id === row.action_id ? { ...r, is_hidden: row.is_hidden } : r
        )
      );
      toast({
        title: 'Error',
        description: 'Failed to update visibility',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const filtered = rows.filter(
    r =>
      r.action_statement.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.role_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.competency_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visibleCount = rows.filter(r => !r.is_hidden).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pro Move Library</CardTitle>
        <CardDescription>
          Control which pro moves are visible in your organization. Hidden moves
          are excluded from coaching sequences and learner views.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search + summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pro moves…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            {visibleCount} of {rows.length} visible
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Pro Move</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Competency</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right w-24">Visibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No pro moves found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow
                      key={row.action_id}
                      className={row.is_hidden ? 'opacity-50' : ''}
                    >
                      <TableCell className="font-medium text-sm">
                        {row.action_statement}
                      </TableCell>
                      <TableCell className="text-sm">{row.role_name}</TableCell>
                      <TableCell className="text-sm">{row.domain_name}</TableCell>
                      <TableCell className="text-sm">{row.competency_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {row.practice_types.join(', ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleHidden(row)}
                          disabled={savingId === row.action_id}
                          title={row.is_hidden ? 'Show this pro move' : 'Hide this pro move'}
                        >
                          {row.is_hidden ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-green-600" />
                          )}
                          <span className="ml-1 text-xs">
                            {row.is_hidden ? 'Hidden' : 'Visible'}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
