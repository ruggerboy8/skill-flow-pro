import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import StaffRow from '@/components/coach/StaffRow';
interface StaffStatus {
  staff_id: string;
  staff_name: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  active_monday: string;
  cycle_number: number;
  week_in_cycle: number;
  phase: string;
  checkin_due: string;
  checkout_open: string;
  checkout_due: string;
  required_count: number;
  conf_count: number;
  perf_count: number;
  backlog_count: number;
  last_activity_kind: string | null;
  last_activity_at: string | null;
  status_state: string;
  is_onboarding: boolean;
  week_label: string;
  plan_count: number;
  focus_count: number;
  tz: string;
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allStatuses, setAllStatuses] = useState<StaffStatus[]>([]);
  const [filteredRows, setFilteredRows] = useState<StaffStatus[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'all');
  const [selectedOrganization, setSelectedOrganization] = useState(searchParams.get('org') || 'all');
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') || 'all');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Redirect if not coach, super admin, or lead RDA
  useEffect(() => {
    if (!loading && !(isCoach || isSuperAdmin || isLead)) {
      navigate('/');
    }
  }, [isCoach, isSuperAdmin, isLead, loading, navigate]);

  useEffect(() => {
    loadStaffData();
  }, []);

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

  useEffect(() => {
    applyFilters();
  }, [allStatuses, selectedLocation, selectedOrganization, selectedRole, search]);

  // Sync URL params with filter state
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedOrganization !== 'all') params.set('org', selectedOrganization);
    if (selectedLocation !== 'all') params.set('loc', selectedLocation);
    if (selectedRole !== 'all') params.set('role', selectedRole);
    if (search.trim()) params.set('q', search.trim());
    
    setSearchParams(params, { replace: true });
  }, [selectedOrganization, selectedLocation, selectedRole, search, setSearchParams]);

  const clearFilters = () => {
    setSelectedOrganization('all');
    setSelectedLocation('all');
    setSelectedRole('all');
    setSearch('');
  };

  const hasActiveFilters = selectedOrganization !== 'all' || selectedLocation !== 'all' || selectedRole !== 'all' || search.trim() !== '';

  const loadStaffData = async () => {
    if (!user) return;
    
    try {
      const { data: statuses, error } = await supabase.rpc('get_staff_statuses', {
        p_coach_user_id: user.id
      });

      if (error) throw error;

      const statusArray = (statuses || []) as StaffStatus[];
      setAllStatuses(statusArray);

      // Extract unique filter values from the results
      const uniqueLocations = [...new Set(statusArray.map(s => s.location_name).filter(Boolean))] as string[];
      const uniqueOrganizations = [...new Set(statusArray.map(s => s.organization_name).filter(Boolean))] as string[];
      const uniqueRoles = [...new Set(statusArray.map(s => s.role_name).filter(Boolean))] as string[];

      setLocations(uniqueLocations);
      setOrganizations(uniqueOrganizations);
      setRoles(uniqueRoles);
    } catch (error) {
      console.error('Error loading staff statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = allStatuses;

    if (selectedLocation !== 'all') {
      filtered = filtered.filter((s) => s.location_name === selectedLocation);
    }

    if (selectedOrganization !== 'all') {
      filtered = filtered.filter((s) => s.organization_name === selectedOrganization);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter((s) => s.role_name === selectedRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) => s.staff_name.toLowerCase().includes(q));
    }

    setFilteredRows(filtered);
  };



  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Coach Dashboard</h1>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Coach Dashboard</h1>

      {/* Filters Bar */}
      <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4 mb-6">
        <div className="flex gap-4 flex-wrap items-center">
          {/* Only show org filter for Coaches and Super Admins */}
          {(isCoach || isSuperAdmin) && (
            <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map((organization) => (
                  <SelectItem key={organization} value={organization}>
                    {organization}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Positions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Positions</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="w-64"
            aria-label="Search staff by name"
          />
          
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearFilters}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Staff List */}
      <div className="space-y-4">
        {/* Column Headers */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
          <div className="col-span-4">Staff Member</div>
          <div className="col-span-3 text-right">Last Activity</div>
          <div className="col-span-5 text-right">Status</div>
        </div>
        
        {/* Staff Rows */}
        <div className="space-y-2">
          {filteredRows.map((row) => {
            // Map status_state to UI-friendly labels
            const statusLabel = 
              row.status_state === 'no_assignments' ? 'No Assignments' :
              row.status_state === 'done' ? 'Complete' :
              row.status_state === 'can_checkin' ? 'Can Check In' :
              row.status_state === 'missed_checkin' ? 'Missed Check-in' :
              row.status_state === 'wait_for_thu' ? 'Waiting for Thursday' :
              row.status_state === 'can_checkout' ? 'Can Check Out' :
              row.status_state === 'missed_checkout' ? 'Missed Check-out' :
              'Unknown';

            // Map to severity
            const severity = 
              row.status_state === 'missed_checkin' || row.status_state === 'missed_checkout' ? 'red' :
              row.status_state === 'can_checkin' || row.status_state === 'can_checkout' ? 'yellow' :
              row.status_state === 'done' ? 'green' :
              row.status_state === 'no_assignments' ? 'yellow' :
              'grey';

            // Format last activity text
            const lastActivityText = row.last_activity_at
              ? `${row.last_activity_kind === 'performance' ? 'Check-out' : 'Check-in'} ${format(new Date(row.last_activity_at), 'MMM d, h:mm a')}`
              : null;

            // Build status detail with debug info
            const debugInfo = `[Debug: ${row.phase} | C${row.cycle_number}W${row.week_in_cycle} | ${row.conf_count}/${row.required_count} conf, ${row.perf_count}/${row.required_count} perf | plan:${row.plan_count} focus:${row.focus_count} | ${row.tz}]`;
            const statusDetail = row.status_state === 'no_assignments'
              ? `No locked assignments for ${row.active_monday}. ${debugInfo}`
              : `${row.conf_count}/${row.required_count} check-ins, ${row.perf_count}/${row.required_count} check-outs. ${debugInfo}`;

            return (
              <StaffRow
                key={row.staff_id}
                member={{
                  id: row.staff_id,
                  name: row.staff_name,
                  role_name: row.role_name,
                  location: row.location_name,
                }}
                status={{
                  color: severity as any,
                  reason: statusLabel,
                  subtext: statusDetail,
                  tooltip: statusDetail,
                  lastActivity: row.last_activity_at ? {
                    kind: row.last_activity_kind as 'confidence' | 'performance',
                    at: new Date(row.last_activity_at)
                  } : undefined,
                  label: statusLabel,
                  severity: severity as any,
                  detail: statusDetail,
                  lastActivityText: lastActivityText || undefined
                }}
                isOnboarding={row.is_onboarding}
                debugInfo={{
                  activeMonday: row.active_monday,
                  phase: row.phase,
                  cycle: row.cycle_number,
                  week: row.week_in_cycle,
                  planCount: row.plan_count,
                  focusCount: row.focus_count,
                  tz: row.tz
                }}
                onClick={() => navigate(`/coach/${row.staff_id}`)}
              />
            );
          })}
        </div>
      </div>

      {filteredRows.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No staff members match the selected filters.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}