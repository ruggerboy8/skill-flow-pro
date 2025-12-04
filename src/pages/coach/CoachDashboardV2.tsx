import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw, CalendarOff } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { StaffWeekSummary } from '@/types/coachV2';
import ReminderComposer from '@/components/coach/ReminderComposer';
import { getChicagoMonday } from '@/lib/plannerUtils';

interface CoachDashboardProps {
  forcedLocationId?: string;        // Locks to specific location by UUID
  hideHeader?: boolean;             // Hides "Coach Dashboard" h1
  hideOrgLocationFilters?: boolean; // Hides org/location dropdowns
}

export default function CoachDashboardV2({ 
  forcedLocationId, 
  hideHeader = false, 
  hideOrgLocationFilters = false 
}: CoachDashboardProps = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // Week selection - always normalize to Monday
  const [selectedWeek, setSelectedWeek] = useState<Date>(() => {
    const weekParam = searchParams.get('week');
    const mondayStr = weekParam ? getChicagoMonday(weekParam) : getChicagoMonday(new Date());
    return new Date(mondayStr + 'T12:00:00');
  });

  // Filter state - restore from URL params
  const [selectedOrganization, setSelectedOrganization] = useState(searchParams.get('org') || 'all');
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'all');
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') || 'all');
  const [search, setSearch] = useState(searchParams.get('q') || '');

  // Reminder state
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<'confidence' | 'performance'>('confidence');
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Exempt week check
  const [isWeekExempt, setIsWeekExempt] = useState(false);

  // Format week for RPC
  const weekOfString = format(selectedWeek, 'yyyy-MM-dd');

  // Load data
  const { rawData, summaries, loading, error, reload } = useStaffWeeklyScores({ 
    weekOf: weekOfString 
  });

  // Week navigation
  const handlePreviousWeek = () => {
    const prev = new Date(selectedWeek);
    prev.setDate(prev.getDate() - 7);
    setSelectedWeek(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(selectedWeek);
    next.setDate(next.getDate() + 7);
    setSelectedWeek(next);
  };

  // Persist week to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('week', format(selectedWeek, 'yyyy-MM-dd'));
    setSearchParams(params, { replace: true });
  }, [selectedWeek]);
  
  // Check if week is exempt
  useEffect(() => {
    const checkExempt = async () => {
      const { data } = await supabase
        .from('excused_weeks')
        .select('reason')
        .eq('week_start_date', weekOfString)
        .maybeSingle();
      setIsWeekExempt(!!data);
    };
    checkExempt();
  }, [weekOfString]);

  // Unique filter options
  const organizations = useMemo(() => {
    return Array.from(new Set(summaries.map(s => s.organization_name))).sort();
  }, [summaries]);

  const locations = useMemo(() => {
    const filtered = selectedOrganization === 'all'
      ? summaries
      : summaries.filter(s => s.organization_name === selectedOrganization);
    return Array.from(new Set(filtered.map(s => s.location_name))).sort();
  }, [summaries, selectedOrganization]);

  const roles = useMemo(() => {
    return Array.from(new Set(summaries.map(s => s.role_name))).sort();
  }, [summaries]);

  // Apply filters
  const filteredSummaries = useMemo(() => {
    let filtered = [...summaries];

    // If forcedLocationId is set, filter by location_id directly
    if (forcedLocationId) {
      filtered = filtered.filter(s => s.location_id === forcedLocationId);
    } else {
      if (selectedOrganization !== 'all') {
        filtered = filtered.filter(s => s.organization_name === selectedOrganization);
      }

      if (selectedLocation !== 'all') {
        filtered = filtered.filter(s => s.location_name === selectedLocation);
      }
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(s => s.role_name === selectedRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.staff_name.toLowerCase().includes(q) ||
        s.staff_email.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [summaries, selectedOrganization, selectedLocation, selectedRole, search, forcedLocationId]);

  // Sort: missing both → missing conf → missing perf → complete, then A-Z
  const sortedRows = useMemo(() => {
    return [...filteredSummaries].sort((a, b) => {
      const aHasConf = a.conf_count === a.assignment_count;
      const aHasPerf = a.perf_count === a.assignment_count;
      const bHasConf = b.conf_count === b.assignment_count;
      const bHasPerf = b.perf_count === b.assignment_count;

      const aPriority = (!aHasConf && !aHasPerf) ? 0
        : !aHasConf ? 1
        : !aHasPerf ? 2
        : 3;

      const bPriority = (!bHasConf && !bHasPerf) ? 0
        : !bHasConf ? 1
        : !bHasPerf ? 2
        : 3;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [filteredSummaries]);

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
  }, [selectedOrganization, selectedLocation, selectedRole, search]);

  // Clear filters
  const clearFilters = () => {
    setSelectedOrganization('all');
    setSelectedLocation('all');
    setSelectedRole('all');
    setSearch('');
  };

  const hasActiveFilters = selectedOrganization !== 'all' || selectedLocation !== 'all' || selectedRole !== 'all' || search.trim() !== '';

  // Missing counts for reminder buttons
  const missingConfCount = sortedRows.filter(s => s.conf_count < s.assignment_count).length;
  const missingPerfCount = sortedRows.filter(s => s.perf_count < s.assignment_count).length;

  // Open reminder modals
  const openConfidenceReminder = () => {
    const missing = sortedRows.filter(s => s.conf_count < s.assignment_count);
    const recipients = missing.map(s => ({
      id: s.staff_id,
      name: s.staff_name,
      email: s.staff_email,
      role_id: s.role_id,
      user_id: s.user_id,
    }));
    setReminderRecipients(recipients);
    setReminderType('confidence');
    setReminderOpen(true);
  };

  const openPerformanceReminder = () => {
    const missing = sortedRows.filter(s => s.perf_count < s.assignment_count);
    const recipients = missing.map(s => ({
      id: s.staff_id,
      name: s.staff_name,
      email: s.staff_email,
      role_id: s.role_id,
      user_id: s.user_id,
    }));
    setReminderRecipients(recipients);
    setReminderType('performance');
    setReminderOpen(true);
  };

  // Toggle row expansion
  const toggleExpanded = (staffId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  };

  // Status pill component - returns colored badge
  function StatusPill({ hasAll, hasAnyLate }: { hasAll: boolean; hasAnyLate: boolean }) {
    if (!hasAll) {
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          Missing
        </Badge>
      );
    }
    if (hasAnyLate) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          Late
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
        Complete
      </Badge>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Coach Dashboard</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Coach Dashboard</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading data: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader && <h1 className="text-3xl font-bold">Coach Dashboard</h1>}

      {/* Week Navigation - Compact inline */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold">
            Week of {format(selectedWeek, 'MMM d, yyyy')}
          </div>
          <Button variant="outline" size="sm" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isWeekExempt && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
              <CalendarOff className="h-3 w-3 mr-1" />
              Exempt Week
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={reload}>
          <RotateCw className="h-4 w-4 mr-2" />
          Reload
        </Button>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {!hideOrgLocationFilters && (
          <>
            <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map(org => (
                  <SelectItem key={org} value={org}>{org}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map(role => (
              <SelectItem key={role} value={role}>{role}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px]"
        />

        {hasActiveFilters && !forcedLocationId && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Staff Coverage Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{sortedRows.length} Staff</CardTitle>
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
          {sortedRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No staff match the selected filters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Confidence</TableHead>
                  <TableHead className="text-center">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map(row => {
                  const isExpanded = expandedRows.has(row.staff_id);
                  const hasAllConf = row.conf_count === row.assignment_count;
                  const hasAllPerf = row.perf_count === row.assignment_count;
                  
                  return (
                    <Collapsible key={row.staff_id} open={isExpanded} onOpenChange={() => toggleExpanded(row.staff_id)} asChild>
                      <>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/coach/${row.staff_id}?week=${weekOfString}`)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-medium">{row.staff_name}</TableCell>
                          <TableCell>{row.role_name}</TableCell>
                          <TableCell>{row.location_name}</TableCell>
                          <TableCell className="text-center">
                            <StatusPill
                              hasAll={hasAllConf}
                              hasAnyLate={row.scores.some(s => s.confidence_late)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusPill
                              hasAll={hasAllPerf}
                              hasAnyLate={row.scores.some(s => s.performance_late)}
                            />
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <CollapsibleContent>
                                <div className="p-4 space-y-2">
                                  <h4 className="font-semibold text-sm">Raw Scores Detail</h4>
                                  <div className="text-xs space-y-1">
                                    {row.scores.map((score, idx) => (
                                      <div key={idx} className="grid grid-cols-6 gap-2 p-2 bg-background rounded border">
                                        <div className="col-span-2">
                                          <span className="font-medium">{score.action_statement}</span>
                                          <span className="text-muted-foreground ml-2">({score.domain_name})</span>
                                        </div>
                                        <div>Conf: {score.confidence_score ?? '—'}</div>
                                        <div>Perf: {score.performance_score ?? '—'}</div>
                                        <div className="col-span-2 text-right text-muted-foreground">
                                          {score.confidence_late && <Badge variant="destructive" className="text-xs mr-1">Conf Late</Badge>}
                                          {score.performance_late && <Badge variant="destructive" className="text-xs">Perf Late</Badge>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    </Collapsible>
                  );
                })}
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
