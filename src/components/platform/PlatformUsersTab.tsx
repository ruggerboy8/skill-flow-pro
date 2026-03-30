import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useToast } from '@/hooks/use-toast';
import { Search, MoreHorizontal, Trash2, KeyRound, Mail } from 'lucide-react';

interface User {
  staff_id: string;
  user_id?: string;
  email?: string;
  name: string;
  role_name?: string;
  location_name?: string;
  is_super_admin: boolean;
  is_org_admin: boolean;
  email_confirmed_at?: string;
  is_paused: boolean;
}

interface OrgOption {
  id: string;
  name: string;
}

export function PlatformUsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 50;

  // Load org list for the filter dropdown
  useEffect(() => {
    supabase
      .from('organizations')
      .select('id, name')
      .order('name')
      .then(({ data }) => setOrgs(data ?? []));
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const loadUsers = async (page = 1, search = debouncedSearch) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'list_users',
          search,
          page,
          limit: usersPerPage,
          // Pass org filter when an org is selected; omit for "all"
          organization_id: selectedOrgId !== 'all' ? selectedOrgId : undefined,
        },
      });

      if (error) throw error;

      setUsers(data.rows || []);
      setTotalUsers(data.total || 0);
      setCurrentPage(page);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Reload when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadUsers(1);
  }, [debouncedSearch, selectedOrgId]);

  const { sortedData, sortConfig, handleSort } = useTableSort(users);

  const getStatusBadge = (user: User) => {
    if (user.is_paused)
      return <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">Paused</Badge>;
    if (!user.email_confirmed_at)
      return <Badge variant="secondary">Invited</Badge>;
    return <Badge variant="default">Active</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Users</CardTitle>
        <CardDescription>
          All staff across every organization. Read-only — use /admin to invite or edit users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground ml-auto">
            {totalUsers} user{totalUsers !== 1 ? 's' : ''}
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
                  <SortableTableHead
                    sortKey="name"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                    className="min-w-[160px]"
                  >
                    Name
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="email"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                    className="min-w-[180px]"
                  >
                    Email
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="role_name"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Role
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="location_name"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Location
                  </SortableTableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((user) => (
                    <TableRow key={user.staff_id}>
                      <TableCell className="font-medium">{user.name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate">
                        {user.email || '—'}
                      </TableCell>
                      <TableCell>{user.role_name || '—'}</TableCell>
                      <TableCell>{user.location_name || '—'}</TableCell>
                      <TableCell>{getStatusBadge(user)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {user.is_super_admin && (
                            <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                              Platform Admin
                            </Badge>
                          )}
                          {user.is_org_admin && (
                            <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                              Org Admin
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalUsers > usersPerPage && (
          <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * usersPerPage + 1}–
              {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => loadUsers(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage * usersPerPage >= totalUsers}
                onClick={() => loadUsers(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
