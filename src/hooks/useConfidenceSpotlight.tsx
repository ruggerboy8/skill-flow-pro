import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subWeeks, format, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { RosterStaff } from './useCoachRosterCoverage';

export interface SpotlightItem {
  action_id: number;
  action_statement: string;
  avg_confidence: number;
  submission_count: number;
  last_date: string;
  staffScores: Map<string, { score: number; date: string; name: string; role: string; location: string }>;
}

export function useConfidenceSpotlight(
  filteredRoster: RosterStaff[],
  lookbackWeeks: number
) {
  const [spotlightItems, setSpotlightItems] = useState<SpotlightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (filteredRoster.length === 0) {
      setSpotlightItems([]);
      return;
    }

    loadSpotlight();
  }, [filteredRoster, lookbackWeeks]);

  const loadSpotlight = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Compute date range
      const now = new Date();
      // Use a representative timezone for computing the range (doesn't matter much for aggregate data)
      const tz = filteredRoster[0]?.tz || 'America/Chicago';
      const currentMonday = computeWeekOf(now, tz);
      const startMonday = format(subWeeks(new Date(currentMonday), lookbackWeeks), 'yyyy-MM-dd');

      // 2. Query weekly_scores for confidence submissions
      const staffIds = filteredRoster.map(s => s.staff_id);

      const { data: scoreRows, error: scoreError } = await supabase
        .from('weekly_scores')
        .select('staff_id, confidence_score, confidence_date, selected_action_id, site_action_id')
        .in('staff_id', staffIds)
        .gte('week_of', startMonday)
        .lte('week_of', currentMonday)
        .not('confidence_score', 'is', null);

      if (scoreError) throw scoreError;

      if (!scoreRows || scoreRows.length === 0) {
        if (filteredRoster.length > 0) {
          console.warn('[Spotlight] Empty', {
            staffCount: filteredRoster.length,
            weekRange: [startMonday, currentMonday],
          });
        }
        setSpotlightItems([]);
        setLoading(false);
        return;
      }

      // 3. Filter out rows with null action_id and compute action_id = coalesce(selected, site)
      const enrichedRows = scoreRows
        .map((row: any) => ({
          ...row,
          action_id: row.selected_action_id || row.site_action_id,
        }))
        .filter((row: any) => row.action_id !== null);

      if (enrichedRows.length === 0) {
        console.debug('[Spotlight] No rows with valid action_id');
        setSpotlightItems([]);
        setLoading(false);
        return;
      }

      // 4. Group by action_id
      const actionMap = new Map<number, {
        scores: number[];
        dates: string[];
        staffScores: Map<string, { score: number; date: string }>;
      }>();

      enrichedRows.forEach((row: any) => {
        const actionId = row.action_id;
        if (!actionMap.has(actionId)) {
          actionMap.set(actionId, {
            scores: [],
            dates: [],
            staffScores: new Map(),
          });
        }

        const entry = actionMap.get(actionId)!;
        entry.scores.push(row.confidence_score);
        entry.dates.push(row.confidence_date);

        // Keep most recent score per staff
        const existing = entry.staffScores.get(row.staff_id);
        if (!existing || new Date(row.confidence_date) > new Date(existing.date)) {
          entry.staffScores.set(row.staff_id, {
            score: row.confidence_score,
            date: row.confidence_date,
          });
        }
      });

      // 5. Fetch pro_moves metadata
      const actionIds = Array.from(actionMap.keys());

      const { data: proMoves, error: movesError } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement')
        .in('action_id', actionIds);

      if (movesError) throw movesError;

      const movesMap = new Map(
        (proMoves || []).map((m: any) => [m.action_id, m.action_statement || `(Unknown action #${m.action_id})`])
      );

      // Build roster map for drill-down
      const rosterMap = new Map(
        filteredRoster.map(s => [s.staff_id, { name: s.staff_name, role: s.role_name, location: s.location_name }])
      );

      // 6. Compute spotlight items
      const items: SpotlightItem[] = Array.from(actionMap.entries()).map(([actionId, data]) => {
        const avg = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
        const lastDate = data.dates.sort().reverse()[0];

        // Enrich staff scores with roster info
        const enrichedStaffScores = new Map<string, { score: number; date: string; name: string; role: string; location: string }>();
        data.staffScores.forEach((scoreData, staffId) => {
          const staff = rosterMap.get(staffId);
          if (staff) {
            enrichedStaffScores.set(staffId, {
              ...scoreData,
              name: staff.name,
              role: staff.role,
              location: staff.location,
            });
          }
        });

        return {
          action_id: actionId,
          action_statement: movesMap.get(actionId) || `(Unknown action #${actionId})`,
          avg_confidence: Math.round(avg * 10) / 10,
          submission_count: data.scores.length,
          last_date: lastDate,
          staffScores: enrichedStaffScores,
        };
      });

      // 7. Sort: ascending by avg_confidence, tie-break by last_date desc
      items.sort((a, b) => {
        if (a.avg_confidence !== b.avg_confidence) {
          return a.avg_confidence - b.avg_confidence;
        }
        return new Date(b.last_date).getTime() - new Date(a.last_date).getTime();
      });

      setSpotlightItems(items);
    } catch (err) {
      console.error('[useConfidenceSpotlight] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { spotlightItems, loading, error };
}

function computeWeekOf(now: Date, tz: string): string {
  const zonedNow = toZonedTime(now, tz);
  const isoDow = zonedNow.getDay() === 0 ? 7 : zonedNow.getDay();
  const daysToMonday = -(isoDow - 1);
  const monday = addDays(zonedNow, daysToMonday);
  return format(monday, 'yyyy-MM-dd');
}
