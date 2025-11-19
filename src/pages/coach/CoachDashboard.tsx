import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useCoachStaffStatuses, type StaffStatus } from '@/hooks/useCoachStaffStatuses';
import ReminderComposer from '@/components/coach/ReminderComposer';

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Filter state - restore from URL params
  const [selectedOrganization, setSelectedOrganization] = useState(searchParams.get('org') || 'all');
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'all');
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') || 'all');
  const [search, setSearch] = useState(searchParams.get('q') || '');

  // Reminder modal state
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<'confidence' | 'performance'>('confidence');
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  // Load staff statuses via RPC
  const { statuses, loading, reload } = useCoachStaffStatuses();

  // Check super admin
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('staff')
          .select('is_super_admin')
          .eq('user_id', user.id)
          .maybeSingle();
        setIsSuperAdmin(Boolean((data as any)?.is_super_admin));
      } catch {
        // ignore
      }
    })();
  }, [user]);

  // Redirect if not authorized
  useEffect(() => {
    if (!loading && !(isCoach || isSuperAdmin || isLead)) {
      navigate('/');
    }
  }, [isCoach, isSuperAdmin, isLead, loading, navigate]);

  // Unique filter options
  const organizations = useMemo(() => {
    return Array.from(new Set(statuses.map(s => s.organization_name))).sort();
  }, [statuses]);

  const locations = useMemo(() => {
    const filtered = selectedOrganization === 'all'
      ? statuses
      : statuses.filter(s => s.organization_name === selectedOrganization);
    return Array.from(new Set(filtered.map(s => s.location_name))).sort();
  }, [statuses, selectedOrganization]);

  const roles = useMemo(() => {
    return Array.from(new Set(statuses.map(s => s.role_name))).sort();
  }, [statuses]);

  // Apply filters
  const filteredStatuses = useMemo(() => {
    let filtered = [...statuses];

    if (selectedOrganization !== 'all') {
      filtered = filtered.filter(s => s.organization_name === selectedOrganization);
    }

    if (selectedLocation !== 'all') {
      filtered = filtered.filter(s => s.location_name === selectedLocation);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(s => s.role_name === selectedRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.staff_name.toLowerCase().includes(q) ||
        s.location_name.toLowerCase().includes(q) ||
        s.role_name.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [statuses, selectedOrganization, selectedLocation, selectedRole, search]);

  // Persist filters to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    
    if (selectedOrganization !== 'all') params.set('org', selectedOrganization);
    else params.delete('org');
    
    if (selectedLocation !== 'all') params.set('loc', selectedLocation);
    else params.delete('loc');
    
    if (selectedRole !== 'all') params.set('role', selectedRole);
    else params.delete('role');
    
    if (search.trim()) params.set('q', search.trim());
    else params.delete('q');

    setSearchParams(params, { replace: true });
  }, [selectedOrganization, selectedLocation, selectedRole, search, setSearchParams]);

  // Clear filters
  const clearFilters = () => {
    setSelectedOrganization('all');
    setSelectedLocation('all');
    setSelectedRole('all');
    setSearch('');
  };

  const hasActiveFilters = selectedOrganization !== 'all' || selectedLocation !== 'all' || selectedRole !== 'all' || search.trim() !== '';

  // Coverage helpers - derive from RPC status data
  const sortedRows = useMemo(() => {
    const rows = filteredStatuses.map(status => ({
      ...status,
      conf_submitted: status.conf_count >= status.required_count,
      perf_submitted: status.perf_count >= status.required_count,
      conf_late: false,
      perf_late: false,
    }));

    // Sort: missing both > missing conf > missing perf > complete, then A-Z by name
    return rows.sort((a, b) => {
      const aPriority = (!a.conf_submitted && !a.perf_submitted) ? 0
        : !a.conf_submitted ? 1
        : !a.perf_submitted ? 2
        : 3;

      const bPriority = (!b.conf_submitted && !b.perf_submitted) ? 0
        : !b.conf_submitted ? 1
        : !b.perf_submitted ? 2
        : 3;

      if (aPriority !== bPriority) return aPriority - bPriority;

      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [filteredStatuses]);

  const missingConfCount = sortedRows.filter(r => !r.conf_submitted).length;
  const missingPerfCount = sortedRows.filter(r => !r.perf_submitted).length;

  // Open reminder modal for confidence
  const openConfidenceReminder = async () => {
    const missing = sortedRows.filter(r => !r.conf_submitted);
    const staffIds = missing.map(r => r.staff_id);
    
    // Fetch user_id for each staff member
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, user_id')
      .in('id', staffIds);
    
    const userIdMap = new Map((staffData || []).map((s: any) => [s.id, s.user_id]));
    
    const recipients = missing.map(r => ({
      id: r.staff_id,
      name: r.staff_name,
      email: r.email || '',
      role_id: r.role_id,
      user_id: userIdMap.get(r.staff_id) || '',
    }));
    setReminderRecipients(recipients);
    setReminderType('confidence');
    setReminderOpen(true);
  };

  // Open reminder modal for performance
  const openPerformanceReminder = async () => {
    const missing = sortedRows.filter(r => !r.perf_submitted);
    const staffIds = missing.map(r => r.staff_id);
    
    // Fetch user_id for each staff member
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, user_id')
      .in('id', staffIds);
    
    const userIdMap = new Map((staffData || []).map((s: any) => [s.id, s.user_id]));
    
    const recipients = missing.map(r => ({
      id: r.staff_id,
      name: r.staff_name,
      email: r.email || '',
      role_id: r.role_id,
      user_id: userIdMap.get(r.staff_id) || '',
    }));
    setReminderRecipients(recipients);
    setReminderType('performance');
    setReminderOpen(true);
  };

  // Format last activity
  const formatLastActivity = (row: StaffStatus) => {
    if (row.last_activity_at && row.last_activity_kind) {
      const date = format(new Date(row.last_activity_at), 'MMM d');
      const type = row.last_activity_kind === 'confidence' ? 'Conf' : 'Perf';
      return `${type} · ${date}`;
    }
    return '—';
  };

  // Status cell component
  function StatusCell({ submitted, late, type }: { submitted: boolean; late: boolean; type: string }) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center gap-2 justify-center">
              {submitted ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <X className="h-5 w-5 text-red-600" />
              )}
              {late && <Badge variant="destructive" className="text-xs">Late</Badge>}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {submitted ? `${type} submitted` : `${type} missing`}
            {late && ' (late)'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Organization</label>
              <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org} value={org}>{org}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Location</label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input
                placeholder="Search staff, location, role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff Coverage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Staff Coverage</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={missingConfCount === 0}
                onClick={openConfidenceReminder}
              >
                Reminder: Confidence ({missingConfCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={missingPerfCount === 0}
                onClick={openPerformanceReminder}
              >
                Reminder: Performance ({missingPerfCount})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStatuses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No staff match the selected filters
            </div>
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
                {sortedRows.map(row => (
                  <TableRow
                    key={row.staff_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/coach/${row.staff_id}`)}
                  >
                    <TableCell className="font-medium">{row.staff_name}</TableCell>
                    <TableCell>{row.role_name}</TableCell>
                    <TableCell>{row.location_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastActivity(row)}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusCell
                        submitted={row.conf_submitted}
                        late={row.conf_late}
                        type="confidence"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusCell
                        submitted={row.perf_submitted}
                        late={row.perf_late}
                        type="performance"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reminder Composer */}
      <ReminderComposer
        type={reminderType}
        recipients={reminderRecipients}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
      />
    </div>
  );
}
