import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCoachRosterCoverage, type RosterStaff, type CoverageData } from '@/hooks/useCoachRosterCoverage';
import { useConfidenceSpotlight, type SpotlightItem } from '@/hooks/useConfidenceSpotlight';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const { toast } = useToast();
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

  // Internal view state (staff vs location-role) - restore from URL
  const [internalView, setInternalView] = useState<'staff' | 'location-role'>(() => {
    const view = searchParams.get('view');
    return view === 'location-role' ? 'location-role' : 'staff';
  });

  // Spotlight drill state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillItem, setDrillItem] = useState<SpotlightItem | null>(null);

  // Load roster and coverage
  const { roster, coverage, loading, reload } = useCoachRosterCoverage();

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
    return Array.from(new Set(roster.map(s => s.organization_name))).sort();
  }, [roster]);

  const locations = useMemo(() => {
    const filtered = selectedOrganization === 'all'
      ? roster
      : roster.filter(s => s.organization_name === selectedOrganization);
    return Array.from(new Set(filtered.map(s => s.location_name))).sort();
  }, [roster, selectedOrganization]);

  const roles = useMemo(() => {
    return Array.from(new Set(roster.map(s => s.role_name))).sort();
  }, [roster]);

  // Apply filters
  const filteredRoster = useMemo(() => {
    let filtered = [...roster];

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
        s.role_name.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [roster, selectedOrganization, selectedLocation, selectedRole, search]);

  // Load spotlight
  const { spotlightItems, loading: spotlightLoading } = useConfidenceSpotlight(filteredRoster, lookbackWeeks);

  // Persist filters to URL - merge params to avoid overwriting
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
    
    if (internalView !== 'staff') params.set('view', internalView);
    else params.delete('view');

    setSearchParams(params, { replace: true });
  }, [selectedOrganization, selectedLocation, selectedRole, search, lookbackWeeks, internalView, setSearchParams]);

  // Clear filters
  const clearFilters = () => {
    setSelectedOrganization('all');
    setSelectedLocation('all');
    setSelectedRole('all');
    setSearch('');
  };

  const hasActiveFilters = selectedOrganization !== 'all' || selectedLocation !== 'all' || selectedRole !== 'all' || search.trim() !== '';

  // Coverage helpers
  const sortedRows = useMemo(() => {
    const rows = filteredRoster.map(staff => ({
      ...staff,
      coverageData: coverage.get(staff.staff_id) || {
        staff_id: staff.staff_id,
        conf_submitted: false,
        perf_submitted: false,
        conf_late: false,
        perf_late: false,
        confidence_date: null,
        performance_date: null,
      },
    }));

    // Sort: missing both > missing conf > missing perf > complete, then A-Z by name
    return rows.sort((a, b) => {
      const aPriority = (!a.coverageData.conf_submitted && !a.coverageData.perf_submitted) ? 0
        : !a.coverageData.conf_submitted ? 1
        : !a.coverageData.perf_submitted ? 2
        : 3;

      const bPriority = (!b.coverageData.conf_submitted && !b.coverageData.perf_submitted) ? 0
        : !b.coverageData.conf_submitted ? 1
        : !b.coverageData.perf_submitted ? 2
        : 3;

      if (aPriority !== bPriority) return aPriority - bPriority;

      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [filteredRoster, coverage]);

  const missingConfCount = sortedRows.filter(r => !r.coverageData.conf_submitted).length;
  const missingPerfCount = sortedRows.filter(r => !r.coverageData.perf_submitted).length;

  // Copy emails logic (reuse dedup from RemindersTab)
  const copyMissingConfEmails = () => {
    const missing = sortedRows.filter(r => !r.coverageData.conf_submitted);
    const deduped = dedup(missing);
    const emails = deduped.map(s => s.email).join(', ');

    navigator.clipboard.writeText(emails).then(() => {
      toast({ title: 'Copied', description: `${deduped.length} emails copied` });
    }).catch(() => {
      toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
    });
  };

  const copyMissingPerfEmails = () => {
    const missing = sortedRows.filter(r => !r.coverageData.perf_submitted);
    const deduped = dedup(missing);
    const emails = deduped.map(s => s.email).join(', ');

    navigator.clipboard.writeText(emails).then(() => {
      toast({ title: 'Copied', description: `${deduped.length} emails copied` });
    }).catch(() => {
      toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
    });
  };

  function dedup(arr: typeof sortedRows) {
    const seen = new Set<string>();
    return arr.filter(x => {
      const key = (x.email || '').toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Spotlight drill
  const drillStaff = useMemo(() => {
    if (!drillItem) return [];

    const staff = Array.from(drillItem.staffScores.entries()).map(([staff_id, data]) => ({
      staff_id,
      ...data,
    }));

    // Sort: ascending by score, tie-break by date desc
    return staff.sort((a, b) => {
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
      {/* Internal view segmented control */}
      <Tabs value={internalView} onValueChange={(v) => setInternalView(v as any)}>
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="location-role">Location × Role</TabsTrigger>
        </TabsList>
      </Tabs>

      {internalView === 'location-role' ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Location × Role view coming soon
          </CardContent>
        </Card>
      ) : (
        <>
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
                    placeholder="Search by name, location, or role..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
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
                <div>
                  <CardTitle>Staff Coverage</CardTitle>
                  <CardDescription className="mt-2">
                    {filteredRoster.length} staff · {missingConfCount} missing confidence · {missingPerfCount} missing performance
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyMissingConfEmails} disabled={missingConfCount === 0}>
                    Copy emails: Missing Conf
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyMissingPerfEmails} disabled={missingPerfCount === 0}>
                    Copy emails: Missing Perf
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRoster.length === 0 ? (
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
                            submitted={row.coverageData.conf_submitted}
                            late={row.coverageData.conf_late}
                            type="confidence"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusCell
                            submitted={row.coverageData.perf_submitted}
                            late={row.coverageData.perf_late}
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
                      <TableHead className="text-right">n</TableHead>
                      <TableHead className="text-right">Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spotlightItems.map(item => (
                      <TableRow
                        key={item.action_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDrill(item)}
                      >
                        <TableCell>{item.action_statement}</TableCell>
                        <TableCell className="text-right font-mono">
                          {item.avg_confidence.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right">{item.submission_count}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {format(new Date(item.last_date), 'MM/dd')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Drill-down side panel */}
      <Sheet open={drillOpen} onOpenChange={setDrillOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Who's lowest on "{drillItem?.action_statement}" (last {lookbackWeeks} weeks)
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6">
            {drillStaff.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No submissions found
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
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
                      <TableHead className="text-right">Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillStaff.map(s => (
                      <TableRow key={s.staff_id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.role}</TableCell>
                        <TableCell>{s.location}</TableCell>
                        <TableCell className="text-right font-mono">{s.score.toFixed(1)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {format(new Date(s.date), 'MM/dd')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusCell({ submitted, late, type }: { submitted: boolean; late: boolean; type: 'confidence' | 'performance' }) {
  if (!submitted) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-block">
              <X className="h-5 w-5 text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Not submitted</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center gap-1">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            {late && (
              <Badge variant="secondary" className="text-xs">Late</Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {late ? 'Submitted late' : 'Submitted on time'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatLastActivity(row: { staff_name: string; tz: string; coverageData: CoverageData }): string {
  const confDate = row.coverageData.confidence_date ? new Date(row.coverageData.confidence_date) : null;
  const perfDate = row.coverageData.performance_date ? new Date(row.coverageData.performance_date) : null;

  if (!confDate && !perfDate) return 'No activity';

  // Determine which is latest and use only that label
  let label: string;
  let latest: Date;
  
  if (confDate && perfDate) {
    if (confDate > perfDate) {
      label = 'confidence';
      latest = confDate;
    } else {
      label = 'performance';
      latest = perfDate;
    }
  } else if (confDate) {
    label = 'confidence';
    latest = confDate;
  } else {
    label = 'performance';
    latest = perfDate!;
  }

  const formatted = formatInTimeZone(latest, row.tz, "EEE MM/dd '@' h:mma");
  const tzAbbr = formatInTimeZone(latest, row.tz, 'zzz');

  return `${label} · ${formatted} ${tzAbbr}`;
}
