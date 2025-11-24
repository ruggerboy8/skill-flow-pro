/**
 * ACTIVE: This is the live coach dashboard
 * 
 * Route: /coach
 * Database: Calls get_staff_statuses(p_coach_user_id uuid, p_week_start date) via useCoachStaffStatuses
 * 
 * This is the V2 implementation that handles weekly assignments (onboarding + global)
 * with proper date normalization to Monday (Central Time).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCoachStaffStatuses, type StaffStatus } from '@/hooks/useCoachStaffStatuses';
import { useAuth } from '@/hooks/useAuth';
import ReminderComposer from '@/components/coach/ReminderComposer';
import { supabase } from '@/integrations/supabase/client';
import { FiltersBar, type FilterOption } from '@/components/coach/dashboard/FiltersBar';
import { CoverageTable } from '@/components/coach/dashboard/CoverageTable';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, parse } from 'date-fns';
import { getAnchors } from '@/lib/centralTime';

export default function CoachDashboardV2() {
  const navigate = useNavigate();
  const { isCoach, isLead, isSuperAdmin, roleLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Week state management - use string format for CT-stable week IDs
  const getInitialWeek = (): string => {
    const weekParam = searchParams.get('week');
    if (weekParam) {
      const parsed = parse(weekParam, 'yyyy-MM-dd', new Date());
      if (!isNaN(parsed.getTime())) {
        // Normalize to Monday using getAnchors
        const { mondayZ } = getAnchors(parsed);
        return format(mondayZ, 'yyyy-MM-dd');
      }
    }
    const { mondayZ } = getAnchors(new Date());
    return format(mondayZ, 'yyyy-MM-dd');
  };

  const [selectedWeek, setSelectedWeek] = useState<string>(getInitialWeek());

  const [filters, setFilters] = useState({
    organization: searchParams.get('org') ?? 'all',
    location: searchParams.get('loc') ?? 'all',
    role: searchParams.get('role') ?? 'all',
    confidenceStatus: searchParams.get('conf') ?? 'all',
    performanceStatus: searchParams.get('perf') ?? 'all',
    search: searchParams.get('q') ?? '',
  });

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<'confidence' | 'performance'>('confidence');
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  const { statuses, loading, error, reload } = useCoachStaffStatuses({
    weekOf: selectedWeek,
  });

  // Debug logging
  useEffect(() => {
    console.log('[CoachDashboardV2] Selected week (string):', selectedWeek);
    console.log('[CoachDashboardV2] Statuses count:', statuses.length);
    if (statuses.length > 0) {
      console.log('[CoachDashboardV2] Sample status:', statuses[0]);
    }
  }, [selectedWeek, statuses]);

  // Role gate
  useEffect(() => {
    if (roleLoading) return;
    if (!(isCoach || isLead || isSuperAdmin)) {
      navigate('/');
    }
  }, [isCoach, isLead, isSuperAdmin, roleLoading, navigate]);

  // Debounce search input for lighter filtering
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(filters.search), 250);
    return () => clearTimeout(timeout);
  }, [filters.search]);

  // Sync filters and week to query string
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (filters.organization !== 'all') params.set('org', filters.organization);
    else params.delete('org');
    if (filters.location !== 'all') params.set('loc', filters.location);
    else params.delete('loc');
    if (filters.role !== 'all') params.set('role', filters.role);
    else params.delete('role');
    if (filters.confidenceStatus !== 'all') params.set('conf', filters.confidenceStatus);
    else params.delete('conf');
    if (filters.performanceStatus !== 'all') params.set('perf', filters.performanceStatus);
    else params.delete('perf');
    if (filters.search.trim()) params.set('q', filters.search.trim());
    else params.delete('q');
    params.set('week', selectedWeek);
    setSearchParams(params, { replace: true });
  }, [filters, selectedWeek, searchParams, setSearchParams]);

  const filteredStatuses = useMemo(() => {
    return statuses.filter((status) => {
      if (filters.organization !== 'all' && status.organization_name !== filters.organization) return false;
      if (filters.location !== 'all' && status.location_name !== filters.location) return false;
      if (filters.role !== 'all' && status.role_name !== filters.role) return false;
      
      // Confidence status filter
      if (filters.confidenceStatus !== 'all') {
        const isMissing = status.conf_submitted_count < status.required_count;
        const isLate = !isMissing && status.conf_late_count > 0;
        const isSubmitted = !isMissing && status.conf_late_count === 0;
        
        if (filters.confidenceStatus === 'missing' && !isMissing) return false;
        if (filters.confidenceStatus === 'late' && !isLate) return false;
        if (filters.confidenceStatus === 'submitted' && !isSubmitted) return false;
      }
      
      // Performance status filter
      if (filters.performanceStatus !== 'all') {
        const isMissing = status.perf_submitted_count < status.required_count;
        const isLate = !isMissing && status.perf_late_count > 0;
        const isSubmitted = !isMissing && status.perf_late_count === 0;
        
        if (filters.performanceStatus === 'missing' && !isMissing) return false;
        if (filters.performanceStatus === 'late' && !isLate) return false;
        if (filters.performanceStatus === 'submitted' && !isSubmitted) return false;
      }
      
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.toLowerCase();
        const searchable = [
          status.staff_name,
          status.location_name,
          status.role_name,
          status.organization_name,
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [statuses, filters.organization, filters.location, filters.role, filters.confidenceStatus, filters.performanceStatus, debouncedSearch]);

  const organizationOptions: FilterOption[] = useMemo(() => {
    const unique = new Set(['all']);
    statuses.forEach((row) => unique.add(row.organization_name));
    return Array.from(unique).map((value) => ({ value, label: value === 'all' ? 'All organizations' : value }));
  }, [statuses]);

  const locationOptions: FilterOption[] = useMemo(() => {
    const unique = new Set(['all']);
    statuses
      .filter((row) => filters.organization === 'all' || row.organization_name === filters.organization)
      .forEach((row) => unique.add(row.location_name));
    return Array.from(unique).map((value) => ({ value, label: value === 'all' ? 'All locations' : value }));
  }, [statuses, filters.organization]);

  const roleOptions: FilterOption[] = useMemo(() => {
    const unique = new Set(['all']);
    statuses.forEach((row) => unique.add(row.role_name));
    return Array.from(unique).map((value) => ({ value, label: value === 'all' ? 'All roles' : value }));
  }, [statuses]);

  const handleSendReminder = async (type: 'confidence' | 'performance') => {
    const missingRows = filteredStatuses.filter((row) =>
      type === 'confidence' ? row.conf_submitted_count < row.required_count : row.perf_submitted_count < row.required_count
    );
    if (missingRows.length === 0) return;

    const staffIds = missingRows.map((row) => row.staff_id);
    const { data, error: staffError } = await supabase.from('staff').select('id, user_id, email').in('id', staffIds);

    if (staffError) {
      console.error('Failed to load staff for reminders', staffError);
      return;
    }

    const staffMap = new Map<string, { user_id: string; email: string | null }>();
    (data || []).forEach((row) => {
      staffMap.set(row.id, { user_id: row.user_id, email: row.email });
    });

    const recipients = missingRows.map((row) => ({
      id: row.staff_id,
      name: row.staff_name,
      email: staffMap.get(row.staff_id)?.email || row.email || '',
      role_id: row.role_id,
      user_id: staffMap.get(row.staff_id)?.user_id || '',
    }));

    setReminderType(type);
    setReminderRecipients(recipients);
    setReminderOpen(true);
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading coach dashboard…
      </div>
    );
  }

  if (!(isCoach || isLead || isSuperAdmin)) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Week Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const parsed = parse(selectedWeek, 'yyyy-MM-dd', new Date());
                const { mondayZ } = getAnchors(addDays(parsed, -7));
                setSelectedWeek(format(mondayZ, 'yyyy-MM-dd'));
              }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev Week
            </Button>
            <div className="text-center">
              <p className="text-lg font-semibold">
                Week of {format(parse(selectedWeek, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
              </p>
              <p className="text-sm text-muted-foreground">
                Weeks start on Monday (Central Time)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const parsed = parse(selectedWeek, 'yyyy-MM-dd', new Date());
                const { mondayZ } = getAnchors(addDays(parsed, 7));
                setSelectedWeek(format(mondayZ, 'yyyy-MM-dd'));
              }}
            >
              Next Week
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          
          <FiltersBar
            organization={filters.organization}
            location={filters.location}
            role={filters.role}
            confidenceStatus={filters.confidenceStatus}
            performanceStatus={filters.performanceStatus}
            search={filters.search}
            organizationOptions={organizationOptions}
            locationOptions={locationOptions}
            roleOptions={roleOptions}
            onChange={setFilters}
            onReset={() => setFilters({ organization: 'all', location: 'all', role: 'all', confidenceStatus: 'all', performanceStatus: 'all', search: '' })}
          />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load staff coverage</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            There was a problem loading staff status data. Please try again.
            <Button size="sm" onClick={() => reload()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
          <CoverageTable
            rows={filteredStatuses}
            loading={loading}
            weekOf={parse(selectedWeek, 'yyyy-MM-dd', new Date())}
            onNavigate={(id) => {
              const params = new URLSearchParams(searchParams);
              params.set('week', selectedWeek);
              navigate(`/coach/${id}?${params.toString()}`);
            }}
            onSendReminder={handleSendReminder}
          />
      )}

      <ReminderComposer
        type={reminderType}
        recipients={reminderRecipients}
        open={reminderOpen}
        onOpenChange={(open) => {
          setReminderOpen(open);
          if (!open) reload();
        }}
      />
    </div>
  );
}
