import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import StaffRow from '@/components/coach/StaffRow';
interface StaffStatus {
  staff_id: string;
  staff_name: string;
  role_id: number;
  role_name: string;
  organization_name: string;
  location_id: string;
  location_name: string;
  assignment_monday: string;
  cycle_number: number;
  week_in_cycle: number;
  week_label: string;
  source: string;
  required_count: number;
  conf_count: number;
  perf_count: number;
  status_state: string;
  status_label: string;
  status_severity: string;
  status_detail: string;
  last_activity_at: string | null;
  last_activity_text: string;
  last_activity_kind: string | null;
  deadline_at: string | null;
  onboarding_weeks_left: number;
  backlog_count: number;
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    
    setLoading(true);
    setError(null);
    try {
      const { data: statuses, error } = await supabase.rpc('get_staff_statuses', {
        p_coach_user_id: user.id
      });

      if (error) {
        setError(`Database error: ${error.message}`);
        console.error('Error fetching staff statuses:', error);
        return;
      }

      const statusArray = (statuses || []) as StaffStatus[];
      setAllStatuses(statusArray);

      // Extract unique filter values from the results
      const uniqueLocations = [...new Set(statusArray.map(s => s.location_name).filter(Boolean))] as string[];
      const uniqueOrganizations = [...new Set(statusArray.map(s => s.organization_name).filter(Boolean))] as string[];
      const uniqueRoles = [...new Set(statusArray.map(s => s.role_name).filter(Boolean))] as string[];

      setLocations(uniqueLocations);
      setOrganizations(uniqueOrganizations);
      setRoles(uniqueRoles);
    } catch (error: any) {
      setError(`Failed to load staff data: ${error?.message || 'Unknown error'}`);
      console.error('Unexpected error loading staff statuses:', error);
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

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full p-1 bg-destructive/20">
                <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">Dashboard Error</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          {filteredRows.map((staffStatus) => (
            <StaffRow
              key={staffStatus.staff_id}
              member={{
                id: staffStatus.staff_id,
                name: staffStatus.staff_name,
                role_name: staffStatus.role_name,
                location: staffStatus.location_name
              }}
              status={{
                color: staffStatus.status_severity as any,
                reason: staffStatus.status_detail,
                label: staffStatus.status_label,
                severity: staffStatus.status_severity as any,
                detail: staffStatus.status_detail,
                lastActivityText: staffStatus.last_activity_text,
                tooltip: staffStatus.status_detail,
                lastActivity: staffStatus.last_activity_at ? {
                  kind: staffStatus.last_activity_kind as any,
                  at: new Date(staffStatus.last_activity_at)
                } : undefined
              }}
              onClick={() => navigate(`/coach/${staffStatus.staff_id}`)}
            />
          ))}
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