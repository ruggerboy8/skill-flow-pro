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
  blocked: boolean;
  confCount: number;
  perfCount: number;
  target?: WeekKey;
}

// Helper to clamp counts to expected max of 3
const clamp3 = (n: number) => Math.max(0, Math.min(3, n));

function getPhase(now: Date, checkinHour = 8) {
  const monday = new Date(now);
  const day = monday.getDay(); // 0 Sun, 1 Mon
  const diffToMonday = (day + 6) % 7; // ISO Monday offset
  monday.setDate(monday.getDate() - diffToMonday);
  monday.setHours(checkinHour, 0, 0, 0);

  const wedEnd = new Date(monday);
  wedEnd.setDate(monday.getDate() + 2); // Wed
  wedEnd.setHours(23, 59, 59, 999);

  const thuStart = new Date(monday);
  thuStart.setDate(monday.getDate() + 3); // Thu 00:00
  thuStart.setHours(0, 0, 0, 0);

  const thuDue = new Date(monday);
  thuDue.setDate(monday.getDate() + 3); // Thu 17:00
  thuDue.setHours(17, 0, 0, 0);

  const sunEnd = new Date(monday);
  sunEnd.setDate(monday.getDate() + 6); // Sun 23:59
  sunEnd.setHours(23, 59, 59, 999);

  if (now < monday) return "pre_checkin" as const;
  if (now <= wedEnd) return "conf_window" as const;
  if (now >= thuStart && now < thuDue) return "thu_due_today" as const;
  if (now >= thuDue && now <= sunEnd) return "thu_after_due_to_sun" as const;
  return "other" as const; // e.g., next Mon after check-in etc.
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
  const phase = getPhase(now);

  // Decide status color
  let color: StatusColor = "grey";
  if (counts.perf === 3) color = "green";
  else if (counts.conf === 3) color = "yellow";
  else color = "grey";

  // Reason logic
  let reason = "On track";

  if (isBlocked) {
    reason = "Finish last week before starting new";
  } else if (color === "green") {
    reason = "Complete";
  } else if (color === "yellow") {
    if (phase === "thu_due_today") reason = "Performance due today";
    else if (phase === "thu_after_due_to_sun") reason = "Performance overdue";
    else reason = "On track"; // Mon–Wed (locked), or other non-overdue times
  } else {
    // Grey
    if (phase === "pre_checkin") reason = "Check-in not started";
    else reason = "Confidence overdue";
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
    blocked: isBlocked,
    confCount: counts.conf,
    perfCount: counts.perf,
    target,
  };
}

export function getSortRank(status: StaffWeekStatus): number {
  const r = status.reason.toLowerCase();
  if (
    r.includes("overdue") ||
    r.includes("finish last week") ||
    r.includes("confidence overdue")
  )
    return 0; // Behind
  if (r.includes("due today")) return 1; // Due today
  if (r.includes("on track") || r.includes("check-in not started") || r.includes("not configured"))
    return 2; // On-track / neutral
  if (r.includes("complete")) return 3; // Complete
  return 2;
}
