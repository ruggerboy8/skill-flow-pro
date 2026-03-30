import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useRoleDisplayNames } from '@/hooks/useRoleDisplayNames';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, EyeOff, Search, Pencil, Plus, Loader2, RotateCcw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProMoveRow {
  action_id: number;
  action_statement: string;
  practice_types: string[];
  role_name: string;
  role_id: number | null;
  domain_name: string;
  competency_name: string;
  competency_id: number | null;
  is_hidden: boolean;
  // Content override fields
  override_id: string | null;
  custom_statement: string | null;
  source: 'platform';
}

interface OrgCustomMove {
  id: string;
  action_statement: string;
  description: string | null;
  role_id: number | null;
  role_name: string;
  competency_id: number | null;
  competency_name: string;
  practice_types: string[];
  source: 'org';
}

interface RoleOption {
  role_id: number;
  role_name: string;
}

interface CompetencyOption {
  competency_id: number;
  name: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function OrgProMoveLibraryTab() {
  const { toast } = useToast();
  const { organizationId } = useUserRole();
  const { resolve: resolveRoleName } = useRoleDisplayNames();

  const [rows, setRows] = useState<ProMoveRow[]>([]);
  const [customMoves, setCustomMoves] = useState<OrgCustomMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // Inline edit state for content overrides
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // New custom move dialog
  const [showNewMoveDialog, setShowNewMoveDialog] = useState(false);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [competencyOptions, setCompetencyOptions] = useState<CompetencyOption[]>([]);
  const [newMove, setNewMove] = useState({
    action_statement: '',
    description: '',
    role_id: '',
    competency_id: '',
  });
  const [savingNewMove, setSavingNewMove] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

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

      // 2. Fetch active pro moves for this practice type
      const { data: proMoves, error: pmErr } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          practice_types,
          role_id,
          competency_id,
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

      // 3. Fetch visibility overrides
      const { data: overrides, error: ovErr } = await (supabase as any)
        .from('organization_pro_move_overrides')
        .select('pro_move_id, is_hidden')
        .eq('org_id', organizationId);

      if (ovErr) throw ovErr;

      const hiddenSet = new Set(
        (overrides ?? []).filter((o: any) => o.is_hidden).map((o: any) => o.pro_move_id)
      );

      // 4. Fetch content overrides
      const { data: contentOverrides } = await (supabase as any)
        .from('organization_pro_move_content_overrides')
        .select('id, pro_move_id, custom_statement')
        .eq('org_id', organizationId);

      const contentMap = new Map<number, { id: string; custom_statement: string | null }>(
        (contentOverrides ?? []).map((c: any) => [c.pro_move_id, { id: c.id, custom_statement: c.custom_statement }])
      );

      const merged: ProMoveRow[] = (proMoves ?? []).map((pm: any) => {
        const content = contentMap.get(pm.action_id);
        return {
          action_id: pm.action_id,
          action_statement: pm.action_statement,
          practice_types: pm.practice_types ?? [],
          role_name: pm.roles?.role_name ?? '—',
          role_id: pm.role_id ?? null,
          domain_name: pm.competencies?.domains?.domain_name ?? '—',
          competency_name: pm.competencies?.name ?? '—',
          competency_id: pm.competency_id ?? null,
          is_hidden: hiddenSet.has(pm.action_id),
          override_id: content?.id ?? null,
          custom_statement: content?.custom_statement ?? null,
          source: 'platform',
        };
      });

      setRows(merged);

      // 5. Fetch org custom moves
      const { data: orgMoves } = await (supabase as any)
        .from('organization_pro_moves')
        .select(`
          id, action_statement, description, role_id, competency_id, practice_types,
          roles!organization_pro_moves_role_id_fkey(role_name),
          competencies!organization_pro_moves_competency_id_fkey(name)
        `)
        .eq('org_id', organizationId)
        .eq('active', true)
        .order('sort_order');

      setCustomMoves(
        (orgMoves ?? []).map((m: any) => ({
          id: m.id,
          action_statement: m.action_statement,
          description: m.description ?? null,
          role_id: m.role_id ?? null,
          role_name: m.roles?.role_name ?? '—',
          competency_id: m.competency_id ?? null,
          competency_name: m.competencies?.name ?? '—',
          practice_types: m.practice_types ?? [],
          source: 'org',
        }))
      );

      // 6. Preload role options for new move dialog
      const { data: orgRoles } = await supabase
        .from('organization_role_names')
        .select('role_id, display_name, roles!organization_role_names_role_id_fkey(role_name)')
        .eq('org_id', organizationId);

      setRoleOptions(
        (orgRoles ?? []).map((r: any) => ({
          role_id: r.role_id,
          role_name: r.display_name || r.roles?.role_name || String(r.role_id),
        }))
      );
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

  // Load competencies when role changes in new move dialog
  useEffect(() => {
    if (!newMove.role_id) { setCompetencyOptions([]); return; }
    supabase
      .from('competencies')
      .select('competency_id, name')
      .eq('role_id', Number(newMove.role_id))
      .then(({ data }) => setCompetencyOptions(data ?? []));
  }, [newMove.role_id]);

  // ── Visibility toggle ─────────────────────────────────────────────────────────

  const toggleHidden = async (row: ProMoveRow) => {
    if (!organizationId) return;
    setSavingId(row.action_id);
    setRows((prev) =>
      prev.map((r) => (r.action_id === row.action_id ? { ...r, is_hidden: !r.is_hidden } : r))
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
      setRows((prev) =>
        prev.map((r) => (r.action_id === row.action_id ? { ...r, is_hidden: row.is_hidden } : r))
      );
      toast({ title: 'Error', description: 'Failed to update visibility', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  // ── Content override save ─────────────────────────────────────────────────────

  const startEdit = (row: ProMoveRow) => {
    setEditingId(row.action_id);
    setEditDraft(row.custom_statement ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (row: ProMoveRow) => {
    if (!organizationId) return;
    setSavingEdit(true);
    try {
      const trimmed = editDraft.trim();
      if (trimmed === '') {
        // Empty = delete the override (reset to platform default)
        if (row.override_id) {
          await (supabase as any)
            .from('organization_pro_move_content_overrides')
            .delete()
            .eq('id', row.override_id);
        }
        setRows((prev) =>
          prev.map((r) =>
            r.action_id === row.action_id ? { ...r, custom_statement: null, override_id: null } : r
          )
        );
      } else {
        const { data, error } = await (supabase as any)
          .from('organization_pro_move_content_overrides')
          .upsert(
            {
              org_id: organizationId,
              pro_move_id: row.action_id,
              custom_statement: trimmed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,pro_move_id' }
          )
          .select('id')
          .single();
        if (error) throw error;
        setRows((prev) =>
          prev.map((r) =>
            r.action_id === row.action_id
              ? { ...r, custom_statement: trimmed, override_id: data?.id ?? r.override_id }
              : r
          )
        );
      }
      setEditingId(null);
      toast({ title: 'Saved', description: 'Pro move text updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const resetOverride = async (row: ProMoveRow) => {
    if (!row.override_id || !organizationId) return;
    setSavingEdit(true);
    try {
      await (supabase as any)
        .from('organization_pro_move_content_overrides')
        .delete()
        .eq('id', row.override_id);
      setRows((prev) =>
        prev.map((r) =>
          r.action_id === row.action_id ? { ...r, custom_statement: null, override_id: null } : r
        )
      );
      toast({ title: 'Reset', description: 'Reverted to platform default text.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Create custom move ────────────────────────────────────────────────────────

  const handleCreateCustomMove = async () => {
    if (!organizationId || !newMove.action_statement.trim()) return;
    setSavingNewMove(true);
    try {
      // Determine practice type from the org
      const { data: orgData } = await supabase
        .from('organizations')
        .select('practice_type')
        .eq('id', organizationId)
        .maybeSingle();

      const { data, error } = await (supabase as any)
        .from('organization_pro_moves')
        .insert({
          org_id: organizationId,
          action_statement: newMove.action_statement.trim(),
          description: newMove.description.trim() || null,
          role_id: newMove.role_id ? Number(newMove.role_id) : null,
          competency_id: newMove.competency_id ? Number(newMove.competency_id) : null,
          practice_types: orgData?.practice_type ? [orgData.practice_type] : [],
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({ title: 'Created', description: 'Custom pro move added.' });
      setShowNewMoveDialog(false);
      setNewMove({ action_statement: '', description: '', role_id: '', competency_id: '' });
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create', variant: 'destructive' });
    } finally {
      setSavingNewMove(false);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────────

  // Derive unique roles and domains for filter dropdowns
  const uniqueRoles = [...new Set(rows.map((r) => r.role_name))].sort();
  const uniqueDomains = [...new Set(rows.map((r) => r.domain_name))].filter((d) => d !== '—').sort();

  const filtered = rows.filter((r) => {
    const matchesSearch =
      (r.custom_statement ?? r.action_statement).toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.role_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.competency_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || r.role_name === roleFilter;
    const matchesDomain = domainFilter === 'all' || r.domain_name === domainFilter;
    const matchesVisibility =
      visibilityFilter === 'all' ||
      (visibilityFilter === 'visible' && !r.is_hidden) ||
      (visibilityFilter === 'hidden' && r.is_hidden);
    return matchesSearch && matchesRole && matchesDomain && matchesVisibility;
  });

  const filteredCustom = customMoves.filter(
    (m) =>
      m.action_statement.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.role_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.competency_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visibleCount = rows.filter((r) => !r.is_hidden).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Pro Move Library</CardTitle>
              <CardDescription>
                Control which pro moves are visible, customize their text, or add your own.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowNewMoveDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Custom Move
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pro moves…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {uniqueRoles.map((r) => (
                  <SelectItem key={r} value={r}>{resolveRoleName ? resolveRoleName(0, r) : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {uniqueDomains.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={visibilityFilter} onValueChange={(v) => setVisibilityFilter(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="visible">Visible</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {visibleCount} of {rows.length} visible
              {customMoves.length > 0 && ` · ${customMoves.length} custom`}
              {filtered.length !== rows.length && ` · ${filtered.length} shown`}
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
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Platform moves */}
                  {filtered.length === 0 && filteredCustom.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No pro moves found
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filtered.map((row) => (
                        <>
                          <TableRow
                            key={`pm-${row.action_id}`}
                            className={row.is_hidden ? 'opacity-50' : ''}
                          >
                            <TableCell className="font-medium text-sm align-top">
                              <div>
                                {row.custom_statement ? (
                                  <>
                                    <span>{row.custom_statement}</span>
                                    <Badge variant="outline" className="ml-2 text-xs text-blue-600 border-blue-300">
                                      Customized
                                    </Badge>
                                  </>
                                ) : (
                                  row.action_statement
                                )}
                              </div>
                              {row.custom_statement && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  Platform: {row.action_statement}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm align-top">{resolveRoleName(row.role_id ?? 0, row.role_name)}</TableCell>
                            <TableCell className="text-sm align-top">{row.domain_name}</TableCell>
                            <TableCell className="text-sm align-top">{row.competency_name}</TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline" className="text-xs capitalize">
                                {row.practice_types.join(', ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <div className="flex items-center justify-end gap-1">
                                {/* Edit text */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => startEdit(row)}
                                  title="Edit text for your org"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {/* Reset to default */}
                                {row.custom_statement && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground"
                                    onClick={() => resetOverride(row)}
                                    title="Reset to platform default"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* Visibility toggle */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleHidden(row)}
                                  disabled={savingId === row.action_id}
                                  title={row.is_hidden ? 'Show this pro move' : 'Hide this pro move'}
                                  className="px-2"
                                >
                                  {row.is_hidden ? (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Eye className="h-4 w-4 text-green-600" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Inline edit row */}
                          {editingId === row.action_id && (
                            <TableRow key={`pm-edit-${row.action_id}`} className="bg-muted/30">
                              <TableCell colSpan={6} className="py-3 px-4">
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground">
                                    Platform text: <em>{row.action_statement}</em>
                                  </p>
                                  <Textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    placeholder="Enter your organization's custom text, or leave blank to reset to platform default…"
                                    rows={2}
                                    className="text-sm"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => saveEdit(row)}
                                      disabled={savingEdit}
                                    >
                                      {savingEdit && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}

                      {/* Org custom moves */}
                      {filteredCustom.map((move) => (
                        <TableRow key={`org-${move.id}`} className="border-l-2 border-l-blue-400">
                          <TableCell className="font-medium text-sm">
                            {move.action_statement}
                            <Badge variant="outline" className="ml-2 text-xs text-blue-600 border-blue-300">
                              Org custom
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{resolveRoleName(move.role_id ?? 0, move.role_name)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">—</TableCell>
                          <TableCell className="text-sm">{move.competency_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {move.practice_types.join(', ') || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs text-muted-foreground">Custom</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Custom Move Dialog */}
      <Dialog open={showNewMoveDialog} onOpenChange={setShowNewMoveDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Custom Pro Move</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-statement">Pro move statement *</Label>
              <Textarea
                id="new-statement"
                value={newMove.action_statement}
                onChange={(e) => setNewMove((p) => ({ ...p, action_statement: e.target.value }))}
                placeholder="e.g. Complete the GDC compliance checklist before the end of the week"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-description">Description (optional)</Label>
              <Textarea
                id="new-description"
                value={newMove.description}
                onChange={(e) => setNewMove((p) => ({ ...p, description: e.target.value }))}
                placeholder="Additional guidance for staff or coaches"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select
                  value={newMove.role_id}
                  onValueChange={(v) => setNewMove((p) => ({ ...p, role_id: v, competency_id: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.role_id} value={String(r.role_id)}>
                        {r.role_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Competency *</Label>
                <Select
                  value={newMove.competency_id}
                  onValueChange={(v) => setNewMove((p) => ({ ...p, competency_id: v }))}
                  disabled={!newMove.role_id || competencyOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={newMove.role_id ? 'Select…' : 'Pick role first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {competencyOptions.map((c) => (
                      <SelectItem key={c.competency_id} value={String(c.competency_id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewMoveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCustomMove}
              disabled={savingNewMove || !newMove.action_statement.trim() || !newMove.role_id || !newMove.competency_id}
            >
              {savingNewMove && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
