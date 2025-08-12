import { startOfWeek, addDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export type StatusColor = "grey" | "yellow" | "green";

export interface WeekKey {
  cycle: number;
  week_in_cycle: number;
  iso_year: number;
  iso_week: number;
}

export interface StaffWeekStatus {
  color: StatusColor;
  reason: string;
  subtext?: string;
  tooltip?: string;
  blocked: boolean;
  confCount: number;
  perfCount: number;
  target?: WeekKey;
}

// Helper to clamp counts to expected max of 3
const clamp3 = (n: number) => Math.max(0, Math.min(3, n));

function getPhase(now: Date, timeZone = 'America/Chicago') {
  const nowZ = toZonedTime(now, timeZone);

  const mondayZ = startOfWeek(nowZ, { weekStartsOn: 1 }); // Mon 00:00 local

  const tueDueZ = setMinutes(setHours(addDays(mondayZ, 1), 12), 0); // Tue 12:00
  const thuStartZ = setHours(addDays(mondayZ, 3), 0); // Thu 00:00
  const friStartZ = setHours(addDays(mondayZ, 4), 0); // Fri 00:00
  const sunEndZ = setMilliseconds(
    setSeconds(setMinutes(setHours(addDays(mondayZ, 6), 23), 59), 59),
    999
  ); // Sun 23:59:59.999

  if (nowZ < tueDueZ) return 'before_tue_noon' as const;
  if (nowZ < thuStartZ) return 'after_tue_before_thu' as const;
  if (nowZ < friStartZ) return 'thu' as const;
  if (nowZ <= sunEndZ) return 'fri_to_sun' as const;
  return 'other' as const; // e.g., next Mon
}

export function computeStaffStatus(
  weeklyScores: Array<{
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
  }>,
  roleId: number,
  currentWeek: WeekKey | undefined,
  now: Date = new Date()
): StaffWeekStatus {
  // Find the most recent week (by updated_at)
  let lastEntry = weeklyScores
    .filter((s) => s.updated_at)
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0];

  const countFor = (wk?: { cycle: number; week_in_cycle: number }) => {
    if (!wk) return { conf: 0, perf: 0 };
    const subset = weeklyScores.filter(
      (s) =>
        s.weekly_focus.cycle === wk.cycle &&
        s.weekly_focus.week_in_cycle === wk.week_in_cycle
    );
    const conf = clamp3(subset.filter((s) => s.confidence_score !== null).length);
    const perf = clamp3(subset.filter((s) => s.performance_score !== null).length);
    return { conf, perf };
  };

  const lastWeekKey = lastEntry
    ? { cycle: lastEntry.weekly_focus.cycle, week_in_cycle: lastEntry.weekly_focus.week_in_cycle }
    : undefined;

  const lastCounts = countFor(lastWeekKey);
  const isBlocked = lastWeekKey ? lastCounts.conf === 3 && lastCounts.perf < 3 : false;

  // Determine target week (blocked takes precedence)
  const target = isBlocked
    ? (lastEntry?.weekly_focus && {
        cycle: lastEntry.weekly_focus.cycle,
        week_in_cycle: lastEntry.weekly_focus.week_in_cycle,
        iso_year: lastEntry.weekly_focus.iso_year,
        iso_week: lastEntry.weekly_focus.iso_week,
      })
    : currentWeek;

  if (!target) {
    return {
      color: "grey",
      reason: "Not configured",
      subtext: undefined,
      blocked: false,
      confCount: 0,
      perfCount: 0,
      target: undefined,
    };
  }

const counts = countFor({ cycle: target.cycle, week_in_cycle: target.week_in_cycle });

// Decide status color
let color: StatusColor = "grey";
if (counts.perf === 3) color = "green";
else if (counts.conf === 3) color = "yellow";
else color = "grey";

// Reason and tooltip logic (America/Chicago)
let reason = "";
let tooltip: string | undefined = undefined;

const phase = getPhase(now, 'America/Chicago');

if (isBlocked) {
  // Blocking takes precedence
  color = "yellow";
  reason = "Finish last week before starting new";
} else if (!target) {
  reason = "Not configured";
} else if (counts.conf < 3) {
  // Confidence incomplete
  if (phase === 'before_tue_noon') {
    reason = ""; // on track, quiet
  } else {
    reason = "Needs confidence";
    // Compute next Monday in Central
    const nowZ = toZonedTime(now, 'America/Chicago');
    const mondayZ = startOfWeek(nowZ, { weekStartsOn: 1 });
    const nextMonZ = addDays(mondayZ, 7);
    const nextMonStr = formatInTimeZone(nextMonZ, 'America/Chicago', 'EEE, MMM d');
    tooltip = `Needs confidence — due Tue 12:00. Will reset on Mon, ${nextMonStr}.`;
  }
} else if (counts.conf === 3 && counts.perf < 3) {
  // Performance pending
  if (phase === 'thu') {
    reason = "Needs performance";
    tooltip = "Needs performance — opens Thu.";
  } else if (phase === 'fri_to_sun' || phase === 'other') {
    reason = "Needs performance";
    tooltip = "Needs performance.";
  } else {
    reason = ""; // Mon–Wed locked; quiet
  }
} else if (counts.perf === 3) {
  // Complete, keep calm
  reason = "";
}

// Subtext for partials
let subtext: string | undefined;
if (color === "grey" && counts.conf > 0 && counts.conf < 3) {
  subtext = `${counts.conf}/3 confidence`;
}
if (color === "yellow" && counts.perf > 0 && counts.perf < 3) {
  subtext = `${counts.perf}/3 performance`;
}

return {
  color,
  reason,
  subtext,
  tooltip,
  blocked: isBlocked,
  confCount: counts.conf,
  perfCount: counts.perf,
  target,
};
}

export function getSortRank(status: StaffWeekStatus): number {
  // Priority: Needs confidence (0) -> Needs performance / Finish last week (1) -> On-track/neutral (2) -> Complete (3)
  const t = (status.tooltip || status.reason || '').toLowerCase();
  if (t.includes('needs confidence')) return 0;
  if (t.includes('needs performance') || status.reason.toLowerCase().includes('finish last week')) return 1;
  if (status.color === 'green') return 3;
  return 2;
}
