import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, type SubmissionStatus } from '@/components/ui/StatusBadge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw, CalendarOff, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleDisplayNames } from '@/hooks/useRoleDisplayNames';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useLocationExcuses } from '@/hooks/useLocationExcuses';
import { StaffWeekSummary } from '@/types/coachV2';
import ReminderComposer from '@/components/coach/ReminderComposer';
import { getChicagoMonday } from '@/lib/plannerUtils';
import { MultiSelect } from '@/components/ui/multi-select';
import { useStaffSubmissionRates } from '@/hooks/useStaffSubmissionRates';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { getLocationSubmissionGates, type SubmissionGates } from '@/lib/submissionStatus';
import { nowUtc } from '@/lib/centralTime';
import { useReminderLog } from '@/hooks/useReminderLog';
import { formatDistanceToNow } from 'date-fns';

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
  const { resolve: resolveRole } = useRoleDisplayNames();

  // Week selection - always normalize to Monday
  const [selectedWeek, setSelectedWeek] = useState<Date>(() => {
    const weekParam = searchParams.get('week');
    const mondayStr = weekParam ? getChicagoMonday(weekParam) : getChicagoMonday(new Date());
    return new Date(mondayStr + 'T12:00:00');
  });

  // Filter state - multi-select arrays, restore from URL params
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>(() => {
    const orgParam = searchParams.get('org');
    return orgParam ? orgParam.split(',').filter(Boolean) : [];
  });
  const [selectedLocations, setSelectedLocations] = useState<string[]>(() => {
    const locParam = searchParams.get('loc');
    return locParam ? locParam.split(',').filter(Boolean) : [];
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    const roleParam = searchParams.get('role');
    return roleParam ? roleParam.split(',').filter(Boolean) : [];
  });
  const [search, setSearch] = useState(searchParams.get('q') || '');

  // Reminder state
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<'confidence' | 'performance'>('confidence');
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Exempt week check
  const [isWeekExempt, setIsWeekExempt] = useState(false);
  
  // Per-location deadline configs
  interface LocationConfig {
    timezone: string;
    conf_due_day: number;
    conf_due_time: string;
    perf_due_day: number;
    perf_due_time: string;
  }
  const [locationConfigs, setLocationConfigs] = useState<Map<string, LocationConfig>>(new Map());
  const [currentNow, setCurrentNow] = useState(nowUtc());

  // Format week for RPC
  const weekOfString = format(selectedWeek, 'yyyy-MM-dd');

  // Load data
  const { rawData, summaries, loading, error, reload } = useStaffWeeklyScores({ 
    weekOf: weekOfString 
  });
  
  // Fetch per-location deadline configs
  useEffect(() => {
    if (summaries.length === 0) return;
    const locationIds = [...new Set(summaries.map(s => s.location_id))];
    supabase
      .from('locations')
      .select('id, timezone, conf_due_day, conf_due_time, perf_due_day, perf_due_time')
      .in('id', locationIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, LocationConfig>();
        data.forEach(loc => {
          map.set(loc.id, {
            timezone: loc.timezone,
            conf_due_day: loc.conf_due_day,
            conf_due_time: loc.conf_due_time,
            perf_due_day: loc.perf_due_day,
            perf_due_time: loc.perf_due_time,
          });
        });
        setLocationConfigs(map);
      });
  }, [summaries]);

  // Keep currentNow updated
  useEffect(() => {
    const interval = setInterval(() => setCurrentNow(nowUtc()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build per-location submission gates
  const locationGatesMap = useMemo(() => {
    const map = new Map<string, SubmissionGates>();
    locationConfigs.forEach((config, locId) => {
      map.set(locId, getLocationSubmissionGates(currentNow, config));
    });
    return map;
  }, [currentNow, locationConfigs]);

  // Check if we're viewing the current week (deadline-awareness only applies to current week)
  const isCurrentWeek = useMemo(() => {
    const currentMonday = getChicagoMonday(new Date());
    return weekOfString === currentMonday;
  }, [weekOfString]);

  // Helper: get deadline-aware status for a metric
  const getDeadlineAwareStatus = useCallback((
    locationId: string, 
    hasAll: boolean, 
    hasAnyLate: boolean, 
    isExcused: boolean,
    metric: 'confidence' | 'performance'
  ): SubmissionStatus => {
    if (isExcused) return 'excused';
    if (hasAll) return hasAnyLate ? 'late' : 'complete';
    
    // For historical weeks, always show missing if not complete
    if (!isCurrentWeek) return 'missing';
    
    const gates = locationGatesMap.get(locationId);
    if (!gates) return 'pending'; // fallback: don't alarm coaches while configs load
    
    if (metric === 'confidence') {
      return gates.isPastConfidenceDeadline ? 'missing' : 'pending';
    } else {
      if (!gates.isPerformanceOpen) return 'not_open';
      return gates.isPastPerformanceDeadline ? 'missing' : 'pending';
    }
  }, [isCurrentWeek, locationGatesMap]);
  
  // Location excuses for this week
  const { excuses } = useLocationExcuses(weekOfString);
  
  // Individual staff excuses for this week
  const [staffExcuseMap, setStaffExcuseMap] = useState<Map<string, { confExcused: boolean; perfExcused: boolean }>>(new Map());
  
  useEffect(() => {
    if (!weekOfString) return;
    const fetchStaffExcuses = async () => {
      const { data } = await supabase
        .from('excused_submissions')
        .select('staff_id, metric')
        .eq('week_of', weekOfString);
      const map = new Map<string, { confExcused: boolean; perfExcused: boolean }>();
      (data ?? []).forEach(e => {
        const existing = map.get(e.staff_id) || { confExcused: false, perfExcused: false };
        if (e.metric === 'confidence') existing.confExcused = true;
        if (e.metric === 'performance') existing.perfExcused = true;
        map.set(e.staff_id, existing);
      });
      setStaffExcuseMap(map);
    };
    fetchStaffExcuses();
  }, [weekOfString]);
  
  // Build lookup map: locationId -> { confExcused, perfExcused }
  const locationExcuseMap = useMemo(() => {
    const map = new Map<string, { confExcused: boolean; perfExcused: boolean }>();
    excuses.forEach(e => {
      const existing = map.get(e.location_id) || { confExcused: false, perfExcused: false };
      if (e.metric === 'confidence') existing.confExcused = true;
      if (e.metric === 'performance') existing.perfExcused = true;
      map.set(e.location_id, existing);
    });
    return map;
  }, [excuses]);
  
  // Helper: check if a staff member's metric is excused (location OR individual)
  const isMetricExcused = useCallback((staffId: string, locationId: string, metric: 'confidence' | 'performance') => {
    const locExcuse = locationExcuseMap.get(locationId);
    const staffExcuse = staffExcuseMap.get(staffId);
    if (metric === 'confidence') {
      return !!(locExcuse?.confExcused || staffExcuse?.confExcused);
    }
    return !!(locExcuse?.perfExcused || staffExcuse?.perfExcused);
  }, [locationExcuseMap, staffExcuseMap]);

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
  const organizationOptions = useMemo(() => {
    const orgs = Array.from(new Set(summaries.map(s => s.group_name))).sort();
    return orgs.map(org => ({ value: org, label: org }));
  }, [summaries]);

  const locationOptions = useMemo(() => {
    const filtered = selectedOrganizations.length === 0
      ? summaries
      : summaries.filter(s => selectedOrganizations.includes(s.group_name));
    const locs = Array.from(new Set(filtered.map(s => s.location_name))).sort();
    return locs.map(loc => ({ value: loc, label: loc }));
  }, [summaries, selectedOrganizations]);

  const roleOptions = useMemo(() => {
    const rolesSet = new Map<string, string>();
    summaries.forEach(s => {
      const display = resolveRole(s.role_id, s.role_name);
      rolesSet.set(display, display);
    });
    return Array.from(rolesSet.keys()).sort().map(role => ({ value: role, label: role }));
  }, [summaries, resolveRole]);

  // Apply filters
  const filteredSummaries = useMemo(() => {
    let filtered = [...summaries];

    // If forcedLocationId is set, filter by location_id directly
    if (forcedLocationId) {
      filtered = filtered.filter(s => s.location_id === forcedLocationId);
    } else {
      if (selectedOrganizations.length > 0) {
        filtered = filtered.filter(s => selectedOrganizations.includes(s.group_name));
      }

      if (selectedLocations.length > 0) {
        filtered = filtered.filter(s => selectedLocations.includes(s.location_name));
      }
    }

    if (selectedRoles.length > 0) {
      filtered = filtered.filter(s => selectedRoles.includes(resolveRole(s.role_id, s.role_name)));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.staff_name.toLowerCase().includes(q) ||
        s.staff_email.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [summaries, selectedOrganizations, selectedLocations, selectedRoles, search, forcedLocationId]);

  // Fetch 6-week submission rates for all visible staff
  const staffIds = useMemo(() => filteredSummaries.map(s => s.staff_id), [filteredSummaries]);
  const { rates: submissionRates, loading: ratesLoading } = useStaffSubmissionRates(staffIds);

  // Extend summaries with 6-week submission rate for sorting
  const extendedSummaries = useMemo(() => {
    return filteredSummaries.map(s => ({
      ...s,
      sixWeekRate: submissionRates.get(s.staff_id) ?? null,
    }));
  }, [filteredSummaries, submissionRates]);

  // Use table sort hook for sortable columns
  const { sortedData, sortConfig, handleSort } = useTableSort(extendedSummaries);

  // Default sort: missing both → missing conf → missing perf → pending → complete, then A-Z
  // Only apply default sort when no explicit sort is selected
  // Deadline-aware: "pending" (before deadline) sorts below "missing" (past deadline)
  const sortedRows = useMemo(() => {
    if (sortConfig.key && sortConfig.order !== null) {
      return sortedData;
    }
    
    // Default priority-based sort — deadline-aware
    return [...extendedSummaries].sort((a, b) => {
      const aConfStatus = getDeadlineAwareStatus(a.location_id, a.conf_count === a.assignment_count, false, isMetricExcused(a.staff_id, a.location_id, 'confidence'), 'confidence');
      const aPerfStatus = getDeadlineAwareStatus(a.location_id, a.perf_count === a.assignment_count, false, isMetricExcused(a.staff_id, a.location_id, 'performance'), 'performance');
      const bConfStatus = getDeadlineAwareStatus(b.location_id, b.conf_count === b.assignment_count, false, isMetricExcused(b.staff_id, b.location_id, 'confidence'), 'confidence');
      const bPerfStatus = getDeadlineAwareStatus(b.location_id, b.perf_count === b.assignment_count, false, isMetricExcused(b.staff_id, b.location_id, 'performance'), 'performance');

      const getPriority = (conf: SubmissionStatus, perf: SubmissionStatus) => {
        const isMissing = (s: SubmissionStatus) => s === 'missing';
        const isPending = (s: SubmissionStatus) => s === 'pending';
        if (isMissing(conf) && isMissing(perf)) return 0;
        if (isMissing(conf)) return 1;
        if (isMissing(perf)) return 2;
        if (isPending(conf) || isPending(perf)) return 3;
        return 4;
      };

      const aPriority = getPriority(aConfStatus, aPerfStatus);
      const bPriority = getPriority(bConfStatus, bPerfStatus);

      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.staff_name.localeCompare(b.staff_name);
    });
  }, [extendedSummaries, sortedData, sortConfig, getDeadlineAwareStatus, isMetricExcused]);

  // Persist filters to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    
    if (selectedOrganizations.length > 0) params.set('org', selectedOrganizations.join(','));
    else params.delete('org');
    
    if (selectedLocations.length > 0) params.set('loc', selectedLocations.join(','));
    else params.delete('loc');
    
    if (selectedRoles.length > 0) params.set('role', selectedRoles.join(','));
    else params.delete('role');
    
    if (search.trim()) params.set('q', search.trim());
    else params.delete('q');

    setSearchParams(params, { replace: true });
  }, [selectedOrganizations, selectedLocations, selectedRoles, search]);

  // Clear filters
  const clearFilters = () => {
    setSelectedOrganizations([]);
    setSelectedLocations([]);
    setSelectedRoles([]);
    setSearch('');
  };

  const hasActiveFilters = selectedOrganizations.length > 0 || selectedLocations.length > 0 || selectedRoles.length > 0 || search.trim() !== '';

  // Missing counts for reminder buttons — all non-submitted, non-excused staff (deadline-agnostic)
  const missingConfCount = sortedRows.filter(s => {
    if (isMetricExcused(s.staff_id, s.location_id, 'confidence')) return false;
    return s.conf_count < s.assignment_count;
  }).length;
  
  const missingPerfCount = sortedRows.filter(s => {
    if (isMetricExcused(s.staff_id, s.location_id, 'performance')) return false;
    return s.perf_count < s.assignment_count;
  }).length;

  // Open reminder modals — all non-submitted, non-excused staff (managers decide timing)
  const openConfidenceReminder = () => {
    const missing = sortedRows.filter(s => {
      if (isMetricExcused(s.staff_id, s.location_id, 'confidence')) return false;
      return s.conf_count < s.assignment_count;
    });
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
    const missing = sortedRows.filter(s => {
      if (isMetricExcused(s.staff_id, s.location_id, 'performance')) return false;
      return s.perf_count < s.assignment_count;
    });
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

  // Deadline-aware status pill
  function DeadlineStatusPill({ locationId, hasAll, hasAnyLate, isExcused, metric }: { 
    locationId: string; hasAll: boolean; hasAnyLate: boolean; isExcused?: boolean; metric: 'confidence' | 'performance' 
  }) {
    const status = getDeadlineAwareStatus(locationId, hasAll, hasAnyLate, !!isExcused, metric);
    return <StatusBadge status={status} />;
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


      {/* Filter controls — collapsible */}
      <Collapsible defaultOpen={hasActiveFilters}>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="h-5 px-1.5 text-2xs">
                  {[selectedOrganizations.length, selectedLocations.length, selectedRoles.length].reduce((a, b) => a + b, 0)}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          {hasActiveFilters && !forcedLocationId && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto w-[260px]"
          />
        </div>
        <CollapsibleContent className="pt-3">
          <div className="flex items-center gap-3 flex-wrap">
            {!hideOrgLocationFilters && (
              <>
                <MultiSelect
                  options={organizationOptions}
                  selected={selectedOrganizations}
                  onChange={setSelectedOrganizations}
                  placeholder="All Groups"
                  searchPlaceholder="Search orgs..."
                  className="min-w-[200px]"
                />

                <MultiSelect
                  options={locationOptions}
                  selected={selectedLocations}
                  onChange={setSelectedLocations}
                  placeholder="All Locations"
                  searchPlaceholder="Search locations..."
                  className="min-w-[200px]"
                />
              </>
            )}

            <MultiSelect
              options={roleOptions}
              selected={selectedRoles}
              onChange={setSelectedRoles}
              placeholder="All Roles"
              searchPlaceholder="Search roles..."
              className="min-w-[160px]"
            />

          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Staff Coverage Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{sortedRows.length} Staff</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reload}>
                <RotateCw className="h-4 w-4 mr-1" />
                Reload
              </Button>
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
                  <SortableTableHead
                    sortKey="staff_name"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                  >
                    Name
                  </SortableTableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <SortableTableHead
                    sortKey="sixWeekRate"
                    currentSortKey={sortConfig.key}
                    sortOrder={sortConfig.order}
                    onSort={handleSort}
                    className="text-center"
                  >
                    6 wk Submission
                  </SortableTableHead>
                  <TableHead className="text-center">Confidence</TableHead>
                  <TableHead className="text-center">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map(row => {
                  const isExpanded = expandedRows.has(row.staff_id);
                  const hasAllConf = row.conf_count === row.assignment_count;
                  const hasAllPerf = row.perf_count === row.assignment_count;
                  const sixWeekRate = row.sixWeekRate;
                  
                  // Determine color based on rate
                  const getRateColor = (rate: number | null) => {
                    if (rate === null) return 'text-muted-foreground';
                    if (rate >= 90) return 'text-green-600';
                    if (rate >= 70) return 'text-yellow-600';
                    return 'text-red-600';
                  };
                  
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
                          <TableCell>{resolveRole(row.role_id, row.role_name)}</TableCell>
                          <TableCell>{row.location_name}</TableCell>
                          <TableCell className={`text-center font-medium ${getRateColor(sixWeekRate)}`}>
                            {ratesLoading ? (
                              <Skeleton className="h-4 w-10 mx-auto" />
                            ) : sixWeekRate === null ? (
                              <span className="text-muted-foreground text-xs">N/A</span>
                            ) : (
                              `${Math.round(sixWeekRate)}%`
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <DeadlineStatusPill
                              locationId={row.location_id}
                              hasAll={hasAllConf}
                              hasAnyLate={row.scores.some(s => s.confidence_late)}
                              isExcused={isMetricExcused(row.staff_id, row.location_id, 'confidence')}
                              metric="confidence"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <DeadlineStatusPill
                              locationId={row.location_id}
                              hasAll={hasAllPerf}
                              hasAnyLate={row.scores.some(s => s.performance_late)}
                              isExcused={isMetricExcused(row.staff_id, row.location_id, 'performance')}
                              metric="performance"
                            />
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30">
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
