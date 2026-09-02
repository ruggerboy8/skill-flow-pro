/**
 * Filters Layout.tsx's role-derived `navigation` array down to the
 * "management" destinations that belong in the mobile avatar menu's
 * management section (MOB-1). This is a pure filter over the SAME
 * navigation array Layout.tsx already builds from useUserRole() — it must
 * never re-derive roles independently, or the avatar menu and the desktop
 * sidebar can drift out of sync (see CLAUDE.md split-brain-permissions note).
 *
 * The Home tab ("/") and the Explore tab ("/my-role") already cover those
 * destinations, so they are excluded. Exclusion is by ROUTE, not by label:
 * a doctor's role page is also named "My Role" but lives at "/doctor/my-role",
 * so a name-based filter would wrongly drop it from a flagged doctor's menu.
 * Everything else in `navigation` (Coach, Facilitate, Command Center, Training,
 * Builder, Admin, Evaluations, Clinical, Doctor, My Location, Platform, ...) is
 * a management/secondary surface the tabs don't cover.
 */

export interface NavLinkItem {
  name: string;
  href: string;
}

const TAB_COVERED_ROUTES = new Set(['/', '/my-role']);

export function getManagementLinks<T extends NavLinkItem>(navigation: T[]): T[] {
  return navigation.filter((item) => !TAB_COVERED_ROUTES.has(item.href));
}
