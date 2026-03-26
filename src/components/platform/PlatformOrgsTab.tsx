import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useToast } from '@/hooks/use-toast';
import { OrgBootstrapDrawer } from './OrgBootstrapDrawer';
import { OrgDetailPanel } from './OrgDetailPanel';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  practice_type: string;
  timezone?: string;
  logo_url?: string | null;
  brand_color?: string | null;
  created_at: string;
  group_count: number;
  setup_complete: boolean | null; // null = still loading
}

export function PlatformOrgsTab() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const [{ data: orgsData, error }, { data: groupCounts }] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, slug, practice_type, timezone, logo_url, brand_color, created_at')
          .order('name'),
        supabase
          .from('practice_groups')
          .select('organization_id')
          .eq('active', true),
      ]);

      if (error) throw error;

      // Build per-org group count map
      const countMap = new Map<string, number>();
      for (const g of groupCounts ?? []) {
        if (g.organization_id) {
          countMap.set(g.organization_id, (countMap.get(g.organization_id) ?? 0) + 1);
        }
      }

      const rows: OrgRow[] = (orgsData ?? []).map((o) => ({
        ...o,
        group_count: countMap.get(o.id) ?? 0,
        setup_complete: null,
      }));

      setOrgs(rows);

      // Fetch setup status for each org in parallel (non-blocking)
      rows.forEach(async (row) => {
        const { data } = await supabase.rpc('is_org_setup_complete', { p_org_id: row.id });
        setOrgs((prev) =>
          prev.map((o) => (o.id === row.id ? { ...o, setup_complete: data === true } : o))
        );
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load organizations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, org: OrgRow) => {
    e.stopPropagation(); // Don't open detail panel

    const { count, error } = await supabase
      .from('practice_groups')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to check org dependencies', variant: 'destructive' });
      return;
    }

    if ((count ?? 0) > 0) {
      toast({
        title: 'Cannot delete',
        description: `"${org.name}" has ${count} group(s). Remove all groups, locations, and users first.`,
        variant: 'destructive',
      });
      return;
    }

    setOrgToDelete(org);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!orgToDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgToDelete.id);

      if (error) throw error;

      toast({ title: 'Deleted', description: `"${orgToDelete.name}" has been removed.` });
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
      if (selectedOrg?.id === orgToDelete.id) setSelectedOrg(null);
      loadOrgs();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete organization',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const { sortedData, sortConfig, handleSort } = useTableSort(orgs);

  useEffect(() => {
    loadOrgs();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Top-level customer organizations on this platform</CardDescription>
            </div>
            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Organization
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="name"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Name
                  </SortableTableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead>Groups</TableHead>
                  <SortableTableHead
                    sortKey="created_at"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Created
                  </SortableTableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No organizations yet
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((org) => (
                    <TableRow
                      key={org.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedOrg(org)}
                    >
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {org.slug}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {org.practice_type === 'pediatric_us'
                            ? 'Pediatric – US'
                            : org.practice_type === 'general_us'
                            ? 'General – US'
                            : org.practice_type === 'general_uk'
                            ? 'General – UK'
                            : org.practice_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {org.setup_complete === null ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : org.setup_complete ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" title="Setup complete" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" title="Setup incomplete" />
                        )}
                      </TableCell>
                      <TableCell>{org.group_count}</TableCell>
                      <TableCell>
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteClick(e, org)}
                          title="Delete organization"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <OrgBootstrapDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => {
          setDrawerOpen(false);
          loadOrgs();
        }}
      />

      <OrgDetailPanel
        org={selectedOrg}
        onClose={() => setSelectedOrg(null)}
        onRefresh={loadOrgs}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{orgToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the organization record. This action cannot be undone.
              <br /><br />
              Any cascading data (role names, weekly plans) will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
