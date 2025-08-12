import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import StaffRow from '@/components/coach/StaffRow';
import { computeStaffStatus, getSortRank, type WeekKey } from '@/lib/coachStatus';
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
  weekly_scores: StaffScore[];
}

export default function CoachDashboard() {
  const navigate = useNavigate();
  const { user, isCoach } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rows, setRows] = useState<{
    member: { id: string; name: string; role_name: string; location: string | null };
    status: ReturnType<typeof computeStaffStatus>;
  }[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [search, setSearch] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentWeekByRole, setCurrentWeekByRole] = useState<Record<number, WeekKey>>({});

  // Redirect if not coach
  useEffect(() => {
    if (!loading && !(isCoach || isSuperAdmin)) {
      navigate('/');
    }
  }, [isCoach, isSuperAdmin, loading, navigate]);

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
  }, [staff, selectedLocation, selectedRole, search]);

  const loadStaffData = async () => {
    try {
      // Get staff roster with score status
      const { data: staffData, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          primary_location,
          role_id,
          roles!inner(role_name),
          weekly_scores(
            confidence_score,
            performance_score,
            updated_at,
            weekly_focus!inner(id, cycle, week_in_cycle, iso_year, iso_week)
          )
        `);

      if (error) throw error;

      // Normalize staff data to our shape
      const processedStaff: StaffMember[] = (staffData as any[]).map((member: any) => ({
        id: member.id,
        name: member.name,
        role_id: member.role_id,
        role_name: (member.roles as any).role_name,
        location: member.primary_location ?? null,
        weekly_scores: (member.weekly_scores || []).map((s: any) => ({
          confidence_score: s.confidence_score,
          performance_score: s.performance_score,
          updated_at: s.updated_at,
          weekly_focus: {
            id: s.weekly_focus.id,
            cycle: s.weekly_focus.cycle,
            week_in_cycle: s.weekly_focus.week_in_cycle,
            iso_year: s.weekly_focus.iso_year,
            iso_week: s.weekly_focus.iso_week,
          },
        })),
      }));

      setStaff(processedStaff);

      // Extract unique locations and roles for filters
      const uniqueLocations = [
        ...new Set(processedStaff.map((s) => s.location).filter(Boolean)),
      ] as string[];
      const uniqueRoles = [
        ...new Set(processedStaff.map((s) => s.role_name)),
      ] as string[];

      setLocations(uniqueLocations);
      setRoles(uniqueRoles);
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = staff;

    if (selectedLocation !== 'all') {
      filtered = filtered.filter((s) => s.location === selectedLocation);
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter((s) => s.role_name === selectedRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
    }

    const now = new Date();
    const mapped = filtered.map((s) => {
      const last = [...s.weekly_scores].sort(
        (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
      )[0];
      const currentWeekGuess: WeekKey | undefined = last
        ? {
            cycle: last.weekly_focus.cycle,
            week_in_cycle: last.weekly_focus.week_in_cycle,
            iso_year: getISOWeekYear(now),
            iso_week: getISOWeek(now),
          }
        : undefined;
      const status = computeStaffStatus(s.weekly_scores, s.role_id, currentWeekGuess, now);
      return {
        member: { id: s.id, name: s.name, role_name: s.role_name, location: s.location },
        status,
      };
    });

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
        </div>
      </div>

      {/* Staff List */}
      <div className="grid gap-4">
        {rows.map(({ member, status }) => (
          <StaffRow
            key={member.id}
            member={member}
            status={status}
            onClick={() => navigate(`/coach/${member.id}`)}
          />
        ))}
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