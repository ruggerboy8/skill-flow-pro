import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MoreMenuRows, type ManagementNavItem } from '@/components/mobile/MoreMenuRows';

/** "Ariyana Test" -> "AT". Falls back to "?" when there's nothing to initial. */
export function initialsFor(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}

/**
 * Header avatar button (top-right, mobile shell only). Opens a bottom Sheet
 * carrying the former "More" tab's rows plus (role permitting) the
 * role-aware management section — MOB-1. A bottom sheet is more
 * thumb-reachable than a top-anchored dropdown on a phone.
 */
export function AvatarMenu({
  name,
  navigation,
}: {
  name: string | null | undefined;
  navigation: ManagementNavItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="flex-none inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="text-xs font-bold">{initialsFor(name)}</AvatarFallback>
          </Avatar>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="mt-2">
          <MoreMenuRows navigation={navigation} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
