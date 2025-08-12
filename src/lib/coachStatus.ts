import { startOfWeek, addDays, setHours, setMinutes, setSeconds, setMilliseconds, getISOWeek, getISOWeekYear } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export type StatusColor = "grey" | "yellow" | "green" | "red";

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

// Decide status color based on expectation windows (America/Chicago)
let color: StatusColor = "green";
let reason = "";
let tooltip: string | undefined = undefined;

// Central-time anchors
const nowZ = toZonedTime(now, 'America/Chicago');
const mondayZ = startOfWeek(nowZ, { weekStartsOn: 1 });
const monCheckInZ = setMinutes(setHours(mondayZ, 9), 0); // Mon 09:00
const tueDueZ = setMinutes(setHours(addDays(mondayZ, 1), 12), 0); // Tue 12:00
const thuStartZ = setHours(addDays(mondayZ, 3), 0); // Thu 00:00
const friStartZ = setHours(addDays(mondayZ, 4), 0); // Fri 00:00
const sunEndZ = setMilliseconds(
  setSeconds(setMinutes(setHours(addDays(mondayZ, 6), 23), 59), 59),
  999
); // Sun 23:59:59.999

// Phase still useful for some checks
const phase = getPhase(now, 'America/Chicago');

// Determine if we're still in the same ISO week as the last entry
const nowIsoWeek = getISOWeek(nowZ);
const nowIsoYear = getISOWeekYear(nowZ);
const lastIsoWeek = lastEntry?.weekly_focus.iso_week;
const lastIsoYear = lastEntry?.weekly_focus.iso_year;
const sameIsoWeekAsLast = !!(lastIsoWeek && lastIsoYear && lastIsoWeek === nowIsoWeek && lastIsoYear === nowIsoYear);

// Confidence expectation window
if (counts.conf < 3) {
  // Before Mon 09:00 → On Track (calm)
  if (nowZ < monCheckInZ) {
    color = "green"; // on track
  } else if (nowZ < tueDueZ) {
    // Mon 09:00 → Tue 11:59 → Needs Confidence
    color = "yellow";
    reason = "Needs Confidence Score";
    tooltip = "Confidence due by Tue 12:00.";
  } else {
    // After Tue 12:00 → Still Yellow with soft reset info
    color = "yellow";
    reason = "Needs Confidence Score";
    const nextMonZ = addDays(mondayZ, 7);
    const nextMonStr = formatInTimeZone(nextMonZ, 'America/Chicago', 'EEE, MMM d');
    tooltip = `Confidence window passed. You’ll get a fresh start on Mon, ${nextMonStr}.`;
  }
} else if (counts.conf === 3 && counts.perf < 3) {
  // Performance pending
  if (isBlocked) {
    // Carryover rules (blocked by last week)
    // Red threshold = following Tue 12:00 Central relative to the blocked week
    const nextWeekMonZ = sameIsoWeekAsLast ? addDays(mondayZ, 7) : mondayZ;
    const carryoverDeadlineZ = setMinutes(setHours(addDays(nextWeekMonZ, 1), 12), 0); // Next Tue 12:00 of the week after last

    if (nowZ >= carryoverDeadlineZ) {
      color = "red";
      reason = "Carryover Required";
      tooltip = "Last week’s performance wasn’t submitted. Close it out before starting a new week.";
    } else {
      if (sameIsoWeekAsLast) {
        // Still in the original week
        if (nowZ < thuStartZ) {
          color = "green"; // performance locked Mon–Wed
        } else if (nowZ < friStartZ) {
          color = "yellow";
          reason = "Needs Performance Score";
          tooltip = "Performance opens Thu. Please submit today.";
        } else if (nowZ <= sunEndZ) {
          color = "yellow";
          reason = "Needs Performance Score";
          tooltip = "Please submit performance to close out this week.";
        }
      } else {
        // In following week before red threshold (Mon morning or Tue morning)
        color = "yellow";
        reason = "Needs Performance Score";
        tooltip = "Please submit performance to close out this week.";
      }
    }
  } else {
    // Not blocked: still on the current week
    if (nowZ < thuStartZ) {
      color = "green"; // performance locked Mon–Wed
    } else if (nowZ < friStartZ) {
      color = "yellow";
      reason = "Needs Performance Score";
      tooltip = "Performance opens Thu. Please submit today.";
    } else if (nowZ <= sunEndZ) {
      color = "yellow";
      reason = "Needs Performance Score";
      tooltip = "Please submit performance to close out this week.";
    } else {
      // Past Sun, before new conf window, remain calm unless blocked logic flips next week
      color = "green";
    }
  }
} else if (counts.perf === 3) {
  // Complete for the target week
  color = "green";
}


// Subtext for partials (keep subtle)
let subtext: string | undefined;
if (counts.conf > 0 && counts.conf < 3) {
  subtext = `${counts.conf}/3 confidence`;
}
if (counts.perf > 0 && counts.perf < 3) {
  subtext = `${counts.perf}/3 performance`;
}

// Not configured case
if (!currentWeek && !isBlocked) {
  return {
    color: "grey",
    reason: "",
    subtext: "Not configured",
    tooltip: undefined,
    blocked: false,
    confCount: counts.conf,
    perfCount: counts.perf,
    target,
  };
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
  // Priority: Red (0) -> Yellow (1) -> Green (2) -> Neutral/others (3)
  if (status.color === 'red') return 0;
  if (status.color === 'yellow') return 1;
  if (status.color === 'green') return 2;
  return 3;
}

