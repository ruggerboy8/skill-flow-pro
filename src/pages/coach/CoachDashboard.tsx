import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import StaffRow from '@/components/coach/StaffRow';

interface StaffWeekData {
  staff_id: string;
  staff_name: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  tz: string;
  week_of: string | null;
  confidence_score: number | null;
  performance_score: number | null;
  confidence_late: boolean | null;
  performance_late: boolean | null;
  confidence_date: string | null;
  performance_date: string | null;
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allStaff, setAllStaff] = useState<StaffWeekData[]>([]);
  const [filteredRows, setFilteredRows] = useState<StaffWeekData[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'all');
  const [selectedOrganization, setSelectedOrganization] = useState(searchParams.get('org') || 'all');
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') || 'all');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!loading && !(isCoach || isSuperAdmin || isLead)) {
      navigate('/');
    }
  }, [isCoach, isSuperAdmin, isLead, loading, navigate]);

  useEffect(() => {
    loadStaffData();
  }, [user]);

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
  }, [allStaff, selectedLocation, selectedOrganization, selectedRole, search]);

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
      const now = new Date();
      
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          role_id,
          primary_location_id,
          roles:role_id(role_name),
          locations:primary_location_id(
            id,
            name,
            timezone,
            organization_id,
            program_start_date,
            cycle_length_weeks,
            organizations!locations_organization_id_fkey(
              id,
              name
            )
          )
        `)
        .eq('is_participant', true)
        .not('primary_location_id', 'is', null);

      if (staffError) throw staffError;

      const staffWithScores = await Promise.all(
        (staffData || []).map(async (staff: any) => {
          const tz = staff.locations?.timezone || 'America/Chicago';
          
          const nowInTz = toZonedTime(now, tz);
          const dayOfWeek = nowInTz.getDay();
          const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const currentMonday = new Date(nowInTz);
          currentMonday.setDate(currentMonday.getDate() + daysToMonday);
          currentMonday.setHours(0, 0, 0, 0);
          const weekOf = format(currentMonday, 'yyyy-MM-dd');

          // Fetch all weekly scores for this staff member and week (multiple rows per staff)
          const { data: scoreRows } = await supabase
            .from('weekly_scores')
            .select('confidence_score, performance_score, confidence_late, performance_late, confidence_date, performance_date')
            .eq('staff_id', staff.id)
            .eq('week_of', weekOf);

          // Aggregate the multiple rows
          const confSubmitted = scoreRows?.filter(r => r.confidence_score !== null).length || 0;
          const perfSubmitted = scoreRows?.filter(r => r.performance_score !== null).length || 0;
          const anyConfLate = scoreRows?.some(r => r.confidence_late) || false;
          const anyPerfLate = scoreRows?.some(r => r.performance_late) || false;

          // Get most recent activity date across all rows
          const allDates = [
            ...(scoreRows?.map(r => r.confidence_date).filter(Boolean) || []),
            ...(scoreRows?.map(r => r.performance_date).filter(Boolean) || [])
          ];
          const mostRecentDate = allDates.length > 0 
            ? new Date(Math.max(...allDates.map(d => new Date(d).getTime()))) 
            : null;

          return {
            staff_id: staff.id,
            staff_name: staff.name,
            role_id: staff.role_id,
            role_name: staff.roles?.role_name || 'Unknown',
            location_id: staff.locations?.id || '',
            location_name: staff.locations?.name || 'Unknown',
            organization_id: staff.locations?.organizations?.id || '',
            organization_name: staff.locations?.organizations?.name || 'Unknown',
            tz,
            week_of: weekOf,
            confidence_score: confSubmitted,
            performance_score: perfSubmitted,
            confidence_late: anyConfLate,
            performance_late: anyPerfLate,
            confidence_date: mostRecentDate?.toISOString() || null,
            performance_date: mostRecentDate?.toISOString() || null,
          };
        })
      );

      setAllStaff(staffWithScores);

      const uniqueOrgs = Array.from(new Set(staffWithScores.map(s => s.organization_name))).sort();
      const uniqueLocs = Array.from(new Set(staffWithScores.map(s => s.location_name))).sort();
      const uniqueRoles = Array.from(new Set(staffWithScores.map(s => s.role_name))).sort();

      setOrganizations(uniqueOrgs);
      setLocations(uniqueLocs);
      setRoles(uniqueRoles);
    } catch (err) {
      console.error('Error loading staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...allStaff];

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
      filtered = filtered.filter(s => s.staff_name.toLowerCase().includes(q));
    }

    filtered.sort((a, b) => {
      const aConfMissing = !a.confidence_score;
      const aPerfMissing = !a.performance_score;
      const bConfMissing = !b.confidence_score;
      const bPerfMissing = !b.performance_score;

      const getPriority = (confMissing: boolean, perfMissing: boolean) => {
        if (confMissing && perfMissing) return 3;
        if (confMissing) return 2;
        if (perfMissing) return 1;
        return 0;
      };

      const aPriority = getPriority(aConfMissing, aPerfMissing);
      const bPriority = getPriority(bConfMissing, bPerfMissing);

      const priorityDiff = bPriority - aPriority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.staff_name.localeCompare(b.staff_name);
    });

    setFilteredRows(filtered);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Coach Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor staff progress and check-ins</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {isSuperAdmin && (
              <div>
                <label className="text-sm font-medium mb-2 block">Organization</label>
                <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Organizations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {organizations.map(org => (
                      <SelectItem key={org} value={org}>{org}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Location</label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="All Locations" />
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
                  <SelectValue placeholder="All Roles" />
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
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredRows.length} of {allStaff.length} staff members
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
              <div className="col-span-4">Name / Role</div>
              <div className="col-span-4 text-right">Last Activity</div>
              <div className="col-span-2 text-center">Conf</div>
              <div className="col-span-2 text-center">Perf</div>
            </div>

            <div className="space-y-2">
              {filteredRows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No staff members match the selected filters
                </div>
              ) : (
                filteredRows.map((row) => {
                  let lastActivityText = 'No check-in yet';
                  if (row.confidence_date || row.performance_date) {
                    const confDate = row.confidence_date ? new Date(row.confidence_date) : null;
                    const perfDate = row.performance_date ? new Date(row.performance_date) : null;
                    
                    let mostRecent: Date | null = null;
                    let activityKind = '';
                    
                    if (confDate && perfDate) {
                      mostRecent = confDate > perfDate ? confDate : perfDate;
                      activityKind = confDate > perfDate ? 'confidence' : 'performance';
                    } else if (confDate) {
                      mostRecent = confDate;
                      activityKind = 'confidence';
                    } else if (perfDate) {
                      mostRecent = perfDate;
                      activityKind = 'performance';
                    }
                    
                    if (mostRecent) {
                      const zonedDate = toZonedTime(mostRecent, row.tz);
                      const dayOfWeek = format(zonedDate, 'EEE');
                      const monthDay = format(zonedDate, 'M/d');
                      const time = format(zonedDate, 'h:mma');
                      lastActivityText = `${activityKind} ${dayOfWeek} ${monthDay} @ ${time}`;
                    }
                  }

                  return (
                    <StaffRow
                      key={row.staff_id}
                      member={{
                        id: row.staff_id,
                        name: row.staff_name,
                        role_name: row.role_name,
                        location: row.location_name
                      }}
                      confStatus={
                        row.confidence_score === 0 ? 'missing' :
                        row.confidence_late ? 'late' : 'complete'
                      }
                      perfStatus={
                        row.performance_score === 0 ? 'missing' :
                        row.performance_late ? 'late' : 'complete'
                      }
                      lastActivityText={lastActivityText}
                      onClick={() => navigate(`/coach/${row.staff_id}`)}
                    />
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
