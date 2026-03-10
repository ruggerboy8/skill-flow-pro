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
import { Plus } from 'lucide-react';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useToast } from '@/hooks/use-toast';
import { OrgBootstrapDrawer } from './OrgBootstrapDrawer';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  practice_type: string;
  created_at: string;
  group_count: number;
}

export function PlatformOrgsTab() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const [{ data: orgsData, error }, { data: groupCounts }] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, slug, practice_type, created_at')
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

      setOrgs(
        (orgsData ?? []).map((o) => ({
          ...o,
          group_count: countMap.get(o.id) ?? 0,
        }))
      );
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
                  <TableHead>Groups</TableHead>
                  <SortableTableHead
                    sortKey="created_at"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Created
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No organizations yet
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {org.slug}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {org.practice_type === 'pediatric' ? 'Pediatric' : 'General'}
                        </Badge>
                      </TableCell>
                      <TableCell>{org.group_count}</TableCell>
                      <TableCell>
                        {new Date(org.created_at).toLocaleDateString()}
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
    </>
  );
}
