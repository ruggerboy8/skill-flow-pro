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
    setLoading(true);

    try {
      // 1) Load staff (unchanged)
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select(`
          id, name, role_id, primary_location_id,
          roles:role_id(role_name),
          locations:primary_location_id(
            id, name, timezone, organization_id, program_start_date, cycle_length_weeks,
            organizations!locations_organization_id_fkey(id, name)
          )
        `)
        .eq('is_participant', true)
        .not('primary_location_id', 'is', null);

      if (staffError) throw staffError;

      // 2) For each staff, compute their local Monday (assignment week)
      const now = new Date();
      type StaffMeta = {
        staff_id: string;
        staff_name: string;
        role_id: number;
        role_name: string;
        location_id: string;
        location_name: string;
        organization_id: string;
        organization_name: string;
        tz: string;
        week_of: string;
      };

      const staffMeta: StaffMeta[] = (staffData || []).map((s: any) => {
        const tz = s.locations?.timezone || 'America/Chicago';
        const nowInTz = toZonedTime(now, tz);
        const dow = nowInTz.getDay();                  // 0=Sun..6=Sat
        const daysToMonday = dow === 0 ? -6 : 1 - dow; // local Monday
        const monday = new Date(nowInTz);
        monday.setDate(monday.getDate() + daysToMonday);
        monday.setHours(0,0,0,0);
        const weekOf = format(monday, 'yyyy-MM-dd');

        return {
          staff_id: s.id,
          staff_name: s.name,
          role_id: s.role_id,
          role_name: s.roles?.role_name || 'Unknown',
          location_id: s.locations?.id || '',
          location_name: s.locations?.name || 'Unknown',
          organization_id: s.locations?.organizations?.id || '',
          organization_name: s.locations?.organizations?.name || 'Unknown',
          tz,
          week_of: weekOf,
        };
      });

      // 3) Group staff by week_of (keeps requests tiny; often 1–2 groups)
      const groupMap = new Map<string, string[]>(); // week_of -> [staff_ids]
      for (const s of staffMeta) {
        const arr = groupMap.get(s.week_of) || [];
        arr.push(s.staff_id);
        groupMap.set(s.week_of, arr);
      }

      // 4) Fetch weekly_scores for current week (DB determines week_of via trigger)
      // Get all scores from the past 10 days (covers current week for all timezones)
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const allStaffIds = staffMeta.map(s => s.staff_id);
      
      const { data: wsRows, error: wsErr } = await supabase
        .from('weekly_scores')
        .select('staff_id, confidence_score, performance_score, confidence_late, performance_late, confidence_date, performance_date, week_of')
        .in('staff_id', allStaffIds)
        .gte('created_at', tenDaysAgo.toISOString());

      if (wsErr) throw wsErr;

      console.log('📈 Weekly scores fetched:', wsRows?.length || 0);
      if ((wsRows?.length ?? 0) === 0) {
        console.warn('⚠️ Empty scores - likely RLS or week_of mismatch');
      } else {
        console.table(
          wsRows!.slice(0, 5).map(r => ({
            staff_id: r.staff_id.slice(0, 8),
            week_of: r.week_of,
            has_conf: r.confidence_score !== null,
            has_perf: r.performance_score !== null,
          }))
        );
      }

      // Aggregate by staff_id + week_of
      type Agg = {
        has_conf: boolean;
        has_perf: boolean;
        conf_late: boolean;
        perf_late: boolean;
        last_conf_date: string | null;
        last_perf_date: string | null;
      };
      
      // Compute current week_of for each staff in their timezone
      const staffWeekOf = new Map<string, string>();
      const currentTime = new Date();
      for (const s of staffMeta) {
        const localTime = toZonedTime(currentTime, s.tz);
        const dow = localTime.getDay();
        const daysToMonday = dow === 0 ? -6 : -(dow - 1);
        const monday = new Date(localTime);
        monday.setDate(monday.getDate() + daysToMonday);
        const weekOf = format(monday, 'yyyy-MM-dd');
        staffWeekOf.set(s.staff_id, weekOf);
      }

      const aggByStaff = new Map<string, Agg>();
      
      // Initialize all staff with defaults
      for (const s of staffMeta) {
        aggByStaff.set(s.staff_id, {
          has_conf: false,
          has_perf: false,
          conf_late: false,
          perf_late: false,
          last_conf_date: null,
          last_perf_date: null,
        });
      }

      // Aggregate scores for current week only
      for (const r of wsRows || []) {
        const expectedWeekOf = staffWeekOf.get(r.staff_id);
        if (r.week_of !== expectedWeekOf) continue; // Skip other weeks

        const a = aggByStaff.get(r.staff_id)!;

        if (r.confidence_score !== null) {
          a.has_conf = true;
          a.conf_late = a.conf_late || !!r.confidence_late;
          if (!a.last_conf_date || new Date(r.confidence_date) > new Date(a.last_conf_date)) {
            a.last_conf_date = r.confidence_date;
          }
        }

        if (r.performance_score !== null) {
          a.has_perf = true;
          a.perf_late = a.perf_late || !!r.performance_late;
          if (!a.last_perf_date || new Date(r.performance_date) > new Date(a.last_perf_date)) {
            a.last_perf_date = r.performance_date;
          }
        }
      }

      // 5) Build the UI rows (one per staff)
      const rows = staffMeta.map(s => {
        const weekOf = staffWeekOf.get(s.staff_id)!;
        const a = aggByStaff.get(s.staff_id)!;

        return {
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          role_id: s.role_id,
          role_name: s.role_name,
          location_id: s.location_id,
          location_name: s.location_name,
          organization_id: s.organization_id,
          organization_name: s.organization_name,
          tz: s.tz,
          week_of: weekOf,
          confidence_score: a.has_conf ? 1 : 0,
          performance_score: a.has_perf ? 1 : 0,
          confidence_late: a.has_conf && a.conf_late,
          performance_late: a.has_perf && a.perf_late,
          confidence_date: a.last_conf_date,
          performance_date: a.last_perf_date,
        };
      });

      console.log('✅ Final rows:', rows.length, 'with activity:', rows.filter(r => r.confidence_score || r.performance_score).length);

      setAllStaff(rows);

      // 6) facet lists
      setOrganizations(Array.from(new Set(rows.map(s => s.organization_name))).sort());
      setLocations(Array.from(new Set(rows.map(s => s.location_name))).sort());
      setRoles(Array.from(new Set(rows.map(s => s.role_name))).sort());
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
                      const monthDay = format(zonedDate, 'MM/dd');
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
