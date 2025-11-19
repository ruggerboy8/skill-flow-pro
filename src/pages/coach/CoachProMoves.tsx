import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useCoachStaffStatuses } from '@/hooks/useCoachStaffStatuses';
import { useConfidenceSpotlight, type SpotlightItem } from '@/hooks/useConfidenceSpotlight';
import { format } from 'date-fns';

export default function CoachProMoves() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isCoach, isLead } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Filter state - restore from URL params
  const [selectedOrganization, setSelectedOrganization] = useState(searchParams.get('org') || 'all');
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'all');
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') || 'all');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [lookbackWeeks, setLookbackWeeks] = useState(() => {
    const param = searchParams.get('lookback');
    return param ? Math.max(1, Math.min(12, parseInt(param))) : 4;
  });

  // Spotlight drill state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillItem, setDrillItem] = useState<SpotlightItem | null>(null);

  // Load staff statuses via RPC
  const { statuses, loading } = useCoachStaffStatuses();

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

  // Convert to roster format for spotlight
  const rosterForSpotlight = useMemo(() => filteredStatuses.map(s => ({
    staff_id: s.staff_id,
    staff_name: s.staff_name,
    email: s.email || '',
    role_id: s.role_id,
    role_name: s.role_name,
    location_id: s.location_id,
    location_name: s.location_name,
    organization_id: s.organization_id,
    organization_name: s.organization_name,
    tz: s.tz,
    week_of: s.active_monday,
  })), [filteredStatuses]);

  // Load spotlight
  const { spotlightItems, loading: spotlightLoading } = useConfidenceSpotlight(rosterForSpotlight, lookbackWeeks);

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
    
    if (lookbackWeeks !== 4) params.set('lookback', String(lookbackWeeks));
    else params.delete('lookback');

    setSearchParams(params, { replace: true });
  }, [selectedOrganization, selectedLocation, selectedRole, search, lookbackWeeks, setSearchParams]);

  // Clear filters
  const clearFilters = () => {
    setSelectedOrganization('all');
    setSelectedLocation('all');
    setSelectedRole('all');
    setSearch('');
  };

  const hasActiveFilters = selectedOrganization !== 'all' || selectedLocation !== 'all' || selectedRole !== 'all' || search.trim() !== '';

  // Drill-down data
  const drillStaff = useMemo(() => {
    if (!drillItem) return [];
    return Array.from(drillItem.staffScores.entries()).map(([staffId, data]) => ({
      staffId,
      name: data.name,
      role: data.role,
      location: data.location,
      score: data.score,
      date: data.date,
    })).sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [drillItem]);

  const openDrill = (item: SpotlightItem) => {
    setDrillItem(item);
    setDrillOpen(true);
  };

  const exportDrillCSV = () => {
    if (!drillItem) return;

    const headers = ['Name', 'Role', 'Location', 'Score', 'Last Date'];
    const rows = drillStaff.map(s => [
      s.name,
      s.role,
      s.location,
      s.score.toFixed(1),
      format(new Date(s.date), 'yyyy-MM-dd'),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spotlight-drill-${drillItem.action_id}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      {/* Confidence Spotlight */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Confidence Spotlight</CardTitle>
              <CardDescription>Pro-moves with lowest confidence scores</CardDescription>
            </div>
            <Select value={String(lookbackWeeks)} onValueChange={v => setLookbackWeeks(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(w => (
                  <SelectItem key={w} value={String(w)}>
                    {w} {w === 1 ? 'week' : 'weeks'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {spotlightLoading ? (
            <Skeleton className="h-64" />
          ) : spotlightItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No confidence submissions in this range
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pro-Move</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spotlightItems.map(item => (
                  <TableRow key={item.action_id}>
                    <TableCell className="font-medium">{item.action_statement}</TableCell>
                    <TableCell className="text-right">{item.avg_confidence.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{item.submission_count}</TableCell>
                    <TableCell className="text-right">{format(new Date(item.last_date), 'MMM d')}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDrill(item)}>
                        Drill
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drill-down sheet */}
      <Sheet open={drillOpen} onOpenChange={setDrillOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drillItem?.action_statement}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {drillStaff.length} staff member{drillStaff.length !== 1 ? 's' : ''}
              </div>
              <Button variant="outline" size="sm" onClick={exportDrillCSV}>
                Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillStaff.map(s => (
                  <TableRow key={s.staffId}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.role}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.location}</TableCell>
                    <TableCell className="text-right font-medium">{s.score.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {format(new Date(s.date), 'MMM d')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
