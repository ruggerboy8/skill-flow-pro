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
import { AlertCircle, Loader2 } from 'lucide-react';

export default function CoachDashboardV2() {
  const navigate = useNavigate();
  const { isCoach, isLead, isSuperAdmin, roleLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    organization: searchParams.get('org') ?? 'all',
    location: searchParams.get('loc') ?? 'all',
    role: searchParams.get('role') ?? 'all',
    search: searchParams.get('q') ?? '',
  });

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<'confidence' | 'performance'>('confidence');
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  const { statuses, loading, error, reload } = useCoachStaffStatuses();

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

  // Sync filters to query string
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (filters.organization !== 'all') params.set('org', filters.organization);
    else params.delete('org');
    if (filters.location !== 'all') params.set('loc', filters.location);
    else params.delete('loc');
    if (filters.role !== 'all') params.set('role', filters.role);
    else params.delete('role');
    if (filters.search.trim()) params.set('q', filters.search.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }, [filters, searchParams, setSearchParams]);

  const filteredStatuses = useMemo(() => {
    return statuses.filter((status) => {
      if (filters.organization !== 'all' && status.organization_name !== filters.organization) return false;
      if (filters.location !== 'all' && status.location_name !== filters.location) return false;
      if (filters.role !== 'all' && status.role_name !== filters.role) return false;
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.toLowerCase();
        const searchable = [
          status.staff_name,
          status.location_name,
          status.role_name,
          status.organization_name,
          status.email || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [statuses, filters.organization, filters.location, filters.role, debouncedSearch]);

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
      type === 'confidence' ? row.conf_count < row.required_count : row.perf_count < row.required_count
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
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <FiltersBar
            organization={filters.organization}
            location={filters.location}
            role={filters.role}
            search={filters.search}
            organizationOptions={organizationOptions}
            locationOptions={locationOptions}
            roleOptions={roleOptions}
            onChange={setFilters}
            onReset={() => setFilters({ organization: 'all', location: 'all', role: 'all', search: '' })}
          />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load staff coverage</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            There was a problem loading staff status data. Please try again.
            <Button size="sm" onClick={reload}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <CoverageTable
          rows={filteredStatuses as StaffStatus[]}
          loading={loading}
          onNavigate={(id) => navigate(`/coach/${id}`)}
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
