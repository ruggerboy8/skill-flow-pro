/**
 * Filters Layout.tsx's role-derived `navigation` array down to the
 * "management" destinations that belong in the mobile avatar menu's
 * management section (MOB-1). This is a pure filter over the SAME
 * navigation array Layout.tsx already builds from useUserRole() — it must
 * never re-derive roles independently, or the avatar menu and the desktop
 * sidebar can drift out of sync (see CLAUDE.md split-brain-permissions note).
 *
 * "Home" and "My Role" are excluded because those destinations are already
 * reachable via the mobile shell's Home and Explore tabs; everything else
 * in `navigation` (Coach, Facilitate, Command Center, Training, Builder,
 * Admin, Evaluations, Clinical, Doctor, My Location, Platform, ...) is a
 * management/secondary surface the tabs don't cover.
 */

export interface NavLinkItem {
  name: string;
  href: string;
}

const TAB_COVERED_LINK_NAMES = new Set(['Home', 'My Role']);

export function getManagementLinks<T extends NavLinkItem>(navigation: T[]): T[] {
  return navigation.filter((item) => !TAB_COVERED_LINK_NAMES.has(item.name));
}
