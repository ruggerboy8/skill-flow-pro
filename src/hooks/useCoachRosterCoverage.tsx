import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { addDays, format } from 'date-fns';

export interface RosterStaff {
  staff_id: string;
  staff_name: string;
  email: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  tz: string;
  week_of: string;
}

export interface CoverageData {
  staff_id: string;
  conf_submitted: boolean;
  perf_submitted: boolean;
  conf_late: boolean;
  perf_late: boolean;
  confidence_date: string | null;
  performance_date: string | null;
}

export function useCoachRosterCoverage() {
  const [roster, setRoster] = useState<RosterStaff[]>([]);
  const [coverage, setCoverage] = useState<Map<string, CoverageData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch roster: staff where is_participant=true, exclude super admins without participant flag
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          email,
          role_id,
          primary_location_id,
          roles:role_id(role_name),
          locations:primary_location_id(
            name,
            organization_id,
            timezone,
            organizations!locations_organization_id_fkey(name)
          )
        `)
        .eq('is_participant', true)
        .not('primary_location_id', 'is', null);

      if (staffError) throw staffError;

      // Filter out super admins without participant flag (already filtered by is_participant=true)
      // Compute week_of for each staff in their local timezone
      const now = new Date();
      const staffMeta: RosterStaff[] = (staffData || [])
        .filter((s: any) => s.primary_location_id && s.locations)
        .map((s: any) => {
          const tz = s.locations.timezone || 'America/Chicago';
          const weekOf = computeWeekOf(now, tz);

          return {
            staff_id: s.id,
            staff_name: s.name,
            email: s.email,
            role_id: s.role_id,
            role_name: s.roles?.role_name || 'Unknown',
            location_id: s.primary_location_id,
            location_name: s.locations?.name || 'Unknown',
            organization_id: s.locations?.organization_id || '',
            organization_name: s.locations?.organizations?.name || 'Unknown',
            tz,
            week_of: weekOf,
          };
        });

      setRoster(staffMeta);

      if (staffMeta.length === 0) {
        setCoverage(new Map());
        setLoading(false);
        return;
      }

      // 2. Batch query weekly_scores
      const staffIds = staffMeta.map(s => s.staff_id);
      const distinctWeekOfs = Array.from(new Set(staffMeta.map(s => s.week_of)));

      const { data: scoreRows, error: scoreError } = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score, confidence_late, performance_late, confidence_date, performance_date')
        .in('staff_id', staffIds)
        .in('week_of', distinctWeekOfs);

      if (scoreError) throw scoreError;

      // Log warning if coverage returns zero rows but roster > 0
      if ((scoreRows || []).length === 0 && staffMeta.length > 0) {
        console.warn('⚠️ Coverage RLS mismatch', {
          rosterCount: staffMeta.length,
          coverageRows: 0,
          message: 'Check RLS policies on weekly_scores'
        });
      }

      // 3. Build coverage map - aggregate all rows per staff+week
      // Group scores by staff_id+week_of (there can be multiple rows per week)
      const scoresByStaffWeek = new Map<string, any[]>();
      (scoreRows || []).forEach(s => {
        if (s.week_of) {
          const key = `${s.staff_id}:${s.week_of}`;
          if (!scoresByStaffWeek.has(key)) {
            scoresByStaffWeek.set(key, []);
          }
          scoresByStaffWeek.get(key)!.push(s);
        }
      });

      const coverageMap = new Map<string, CoverageData>();

      staffMeta.forEach(staff => {
        const scores = scoresByStaffWeek.get(`${staff.staff_id}:${staff.week_of}`) || [];
        
        // Check if ANY row has confidence/performance submitted
        const hasConfidence = scores.some(s => s.confidence_score !== null);
        const hasPerformance = scores.some(s => s.performance_score !== null);
        
        // Get latest dates and late flags
        const confRows = scores.filter(s => s.confidence_score !== null);
        const perfRows = scores.filter(s => s.performance_score !== null);
        
        const latestConfDate = confRows.length > 0 
          ? confRows.reduce((latest, row) => {
              const rowDate = row.confidence_date ? new Date(row.confidence_date) : null;
              return rowDate && (!latest || rowDate > latest) ? rowDate : latest;
            }, null as Date | null)
          : null;
          
        const latestPerfDate = perfRows.length > 0
          ? perfRows.reduce((latest, row) => {
              const rowDate = row.performance_date ? new Date(row.performance_date) : null;
              return rowDate && (!latest || rowDate > latest) ? rowDate : latest;
            }, null as Date | null)
          : null;

        coverageMap.set(staff.staff_id, {
          staff_id: staff.staff_id,
          conf_submitted: hasConfidence,
          perf_submitted: hasPerformance,
          conf_late: confRows.some(s => s.confidence_late),
          perf_late: perfRows.some(s => s.performance_late),
          confidence_date: latestConfDate ? latestConfDate.toISOString() : null,
          performance_date: latestPerfDate ? latestPerfDate.toISOString() : null,
        });
      });

      setCoverage(coverageMap);
    } catch (err) {
      console.error('[useCoachRosterCoverage] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { roster, coverage, loading, error, reload: load };
}

function computeWeekOf(now: Date, tz: string): string {
  const zonedNow = toZonedTime(now, tz);
  const isoDow = zonedNow.getDay() === 0 ? 7 : zonedNow.getDay(); // ISO: Mon=1, Sun=7
  const daysToMonday = -(isoDow - 1);
  const monday = addDays(zonedNow, daysToMonday);
  return format(monday, 'yyyy-MM-dd');
}
