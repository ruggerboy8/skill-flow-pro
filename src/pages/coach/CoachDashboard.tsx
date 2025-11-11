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
import { computeStaffStatusNew, getSortRank } from '@/lib/coachStatus';
import { getISOWeek, getISOWeekYear } from 'date-fns';
interface StaffScore {
  confidence_score: number | null;
  performance_score: number | null;
  updated_at: string | null;
  weekly_focus: {
    id: string;
    cycle: number;
    week_in_cycle: number;
    iso_year: number;
    iso_week: number;
  };
}

interface StaffMember {
  id: string;
  name: string;
  role_id: number;
  role_name: string;
  location: string | null;
  organization: string | null;
  user_id: string;
  hire_date?: string | null;
  onboarding_weeks: number;
  primary_location_id?: string | null;
  weekly_scores: StaffScore[];
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rows, setRows] = useState<{
    member: { id: string; name: string; role_name: string; location: string | null };
    status: Awaited<ReturnType<typeof computeStaffStatusNew>>;
  }[]>([]);
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
  }, [staff, selectedLocation, selectedOrganization, selectedRole, search]);

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
    try {
      const now = new Date();
      
      // Get current user's scopes for Lead RDA filtering using junction table
      let myScopeOrgIds: string[] = [];
      let myScopeLocationIds: string[] = [];
      
      if (isLead && !isCoach && !isSuperAdmin) {
        const { data: myStaff } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (myStaff) {
          const { data: myScopes } = await supabase
            .from('coach_scopes')
            .select('scope_type, scope_id')
            .eq('staff_id', myStaff.id);
          
          if (myScopes) {
            myScopeOrgIds = myScopes.filter(s => s.scope_type === 'org').map(s => s.scope_id);
            myScopeLocationIds = myScopes.filter(s => s.scope_type === 'location').map(s => s.scope_id);
          }
        }
      }
      
      // Get staff roster with additional fields needed for new system
      const { data: staffData, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          user_id,
          primary_location_id,
          role_id,
          hire_date,
          onboarding_weeks,
          is_participant,
          roles!inner(role_name),
          locations(name, organization_id, organizations!locations_organization_id_fkey(name))
        `)
        .eq('is_participant', true);

      if (error) throw error;

      // Normalize staff data to our shape
      const processedStaff: StaffMember[] = (staffData as any[])
        // TEMPORARILY SHOWING SUPER ADMINS: .filter((member: any) => member.user_id !== user?.id) // Exclude self
        .filter((member: any) => {
          // Lead RDAs only see their scopes (OR logic)
          if (isLead && !isCoach && !isSuperAdmin) {
            if (myScopeOrgIds.length > 0) {
              return myScopeOrgIds.includes(member.locations?.organization_id);
            } else if (myScopeLocationIds.length > 0) {
              return myScopeLocationIds.includes(member.primary_location_id);
            }
            return false;
          }
          return true;
        })
        .map((member: any) => ({
          id: member.id,
          name: member.name,
          role_id: member.role_id,
          role_name: (member.roles as any).role_name,
          location: member.locations?.name ?? null,
          organization: member.locations?.organizations?.name ?? null,
          user_id: member.user_id,
          hire_date: member.hire_date,
          onboarding_weeks: member.onboarding_weeks || 6,
          primary_location_id: member.primary_location_id,
          weekly_scores: []
        }));

      setStaff(processedStaff);

      // Extract unique locations, organizations, and roles for filters
      const uniqueLocations = [
        ...new Set(processedStaff.map((s) => s.location).filter(Boolean)),
      ] as string[];
      const uniqueOrganizations = [
        ...new Set(processedStaff.map((s) => s.organization).filter(Boolean)),
      ] as string[];
      const uniqueRoles = [
        ...new Set(processedStaff.map((s) => s.role_name)),
      ] as string[];

      setLocations(uniqueLocations);
      setOrganizations(uniqueOrganizations);
      setRoles(uniqueRoles);
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = async () => {
    let filtered = staff;

    if (selectedLocation !== 'all') {
      filtered = filtered.filter((s) => s.location === selectedLocation);
    }

    if (selectedOrganization !== 'all') {
      filtered = filtered.filter((s) => s.organization === selectedOrganization);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter((s) => s.role_name === selectedRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
    }

    const now = new Date();
    
    // Compute status for all staff members in parallel instead of sequentially
    const statusPromises = filtered.map(async (s) => {
      const status = await computeStaffStatusNew(
        s.user_id, 
        { 
          id: s.id, 
          role_id: s.role_id, 
          hire_date: s.hire_date, 
          onboarding_weeks: s.onboarding_weeks,
          primary_location_id: s.primary_location_id
        }, 
        now
      );
      
      return {
        member: { id: s.id, name: s.name, role_name: s.role_name, location: s.location },
        status,
      };
    });

    const mapped = await Promise.all(statusPromises);

    mapped.sort(
      (a, b) => getSortRank(a.status) - getSortRank(b.status) || a.member.name.localeCompare(b.member.name)
    );

    setRows(mapped);
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
          {rows.map(({ member, status }) => (
            <StaffRow
              key={member.id}
              member={member}
              status={status}
              onClick={() => navigate(`/coach/${member.id}`)}
            />
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No staff members match the selected filters.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}