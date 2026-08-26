// LRM-4: pure selection-model logic for the recipient review step (the
// dialog "Send to doctors" opens). Kept separate from React so grouping and
// exclusion toggling are unit-testable without rendering the dialog.
// Mirrors the leadWeekBlasts.ts / leadMeetingsAndFocus.ts pattern.
//
// The selection state itself is just "which staff ids are excluded" (a
// Set<string>), starting empty (everyone checked) fresh every time the
// dialog opens -- there is no carry-over between weeks or between opens of
// the same week (see spec "Decisions locked").

import type { LeadWeekBlastRecipient } from '@/types/leadWeekBlasts';

export interface RecipientLocationGroup {
  /** Stable react key; not shown. 'roaming' for the location-less group. */
  key: string;
  /** Display label; 'Roaming' for doctors with no home location. */
  label: string;
  doctors: LeadWeekBlastRecipient[];
}

const ROAMING_KEY = '__roaming__';

/**
 * Groups the recipient list by location_name, alphabetically by location,
 * with a single "Roaming" group (location_name === null) always listed
 * last -- doctors with no home location still need somewhere to appear.
 */
export function groupRecipientsByLocation(recipients: LeadWeekBlastRecipient[]): RecipientLocationGroup[] {
  const byKey = new Map<string, RecipientLocationGroup>();
  for (const r of recipients) {
    const isRoaming = r.location_name === null;
    const key = isRoaming ? ROAMING_KEY : r.location_name!;
    const label = isRoaming ? 'Roaming' : r.location_name!;
    if (!byKey.has(key)) byKey.set(key, { key, label, doctors: [] });
    byKey.get(key)!.doctors.push(r);
  }
  const groups = Array.from(byKey.values());
  const named = groups.filter((g) => g.key !== ROAMING_KEY).sort((a, b) => a.label.localeCompare(b.label));
  const roaming = groups.filter((g) => g.key === ROAMING_KEY);
  return [...named, ...roaming];
}

/** True when no doctor in this group is currently excluded (its select-all checkbox reads "checked"). */
export function isGroupFullyIncluded(excludedIds: ReadonlySet<string>, group: RecipientLocationGroup): boolean {
  return group.doctors.every((d) => !excludedIds.has(d.staff_id));
}

/** True when no doctor across the whole list is currently excluded (the top-level everyone toggle reads "checked"). */
export function isEveryoneIncluded(excludedIds: ReadonlySet<string>, recipients: LeadWeekBlastRecipient[]): boolean {
  return recipients.every((d) => !excludedIds.has(d.staff_id));
}

/** Toggles a single doctor's checkbox. */
export function toggleDoctorExclusion(excludedIds: ReadonlySet<string>, staffId: string): Set<string> {
  const next = new Set(excludedIds);
  if (next.has(staffId)) next.delete(staffId);
  else next.add(staffId);
  return next;
}

/**
 * A location's select all/none toggle: if every doctor in the group is
 * currently included, unchecking the group excludes all of them; otherwise
 * it includes all of them.
 */
export function toggleGroupExclusion(excludedIds: ReadonlySet<string>, group: RecipientLocationGroup): Set<string> {
  const next = new Set(excludedIds);
  const fullyIncluded = isGroupFullyIncluded(excludedIds, group);
  for (const d of group.doctors) {
    if (fullyIncluded) next.add(d.staff_id);
    else next.delete(d.staff_id);
  }
  return next;
}

/**
 * The top-level everyone toggle: same all-or-nothing rule as a location's
 * toggle, but across the full recipient list.
 */
export function toggleAllExclusion(excludedIds: ReadonlySet<string>, recipients: LeadWeekBlastRecipient[]): Set<string> {
  if (isEveryoneIncluded(excludedIds, recipients)) {
    return new Set(recipients.map((d) => d.staff_id));
  }
  return new Set();
}

/** How many of the total will actually receive the send, given the current exclusions. */
export function deriveIncludedCount(totalCount: number, excludedCount: number): number {
  return Math.max(0, totalCount - excludedCount);
}

/** The live "Sending to N of M doctors" line. */
export function buildSendingSummary(totalCount: number, excludedCount: number): string {
  const included = deriveIncludedCount(totalCount, excludedCount);
  const doctorWord = totalCount === 1 ? 'doctor' : 'doctors';
  return `Sending to ${included} of ${totalCount} ${doctorWord}`;
}

/** The exclusion ids to send to the server, in whatever order the Set iterates. */
export function deriveExclusionIds(excludedIds: ReadonlySet<string>): string[] {
  return Array.from(excludedIds);
}
