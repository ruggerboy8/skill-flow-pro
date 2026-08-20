import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { supabase } from '@/integrations/supabase/client';
import { getManagementLinks } from '@/lib/managementNavigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InstallInstructions } from '@/components/pwa/InstallInstructions';
import { isStandalone, isDeviceOptedOut, setDeviceOptOut } from '@/lib/pwa';
import { ProMovesLogo } from '@/components/ProMovesLogo';

export interface ManagementNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

function Row({
  label,
  sub,
  icon: Icon,
  onClick,
}: {
  label: string;
  sub?: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 py-3.5 min-h-[52px] border-b border-border last:border-none text-left active:bg-primary/5"
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground flex-none" />}
        <span>
          {label}
          {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
    </button>
  );
}

/** "{location name} · {n} teammates" — Copy appendix. */
function useTeamRowSub(locationId: string | null, staffId: string | undefined, roleId: number | null) {
  const [sub, setSub] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId || !staffId) return;
    let cancelled = false;
    (async () => {
      // Count only the lead's own role, matching the /team roster's role filter
      // (a Lead RDA sees RDAs only), so the "N teammates" subtitle can't disagree
      // with the roster count.
      let countQuery = supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('primary_location_id', locationId)
        .eq('is_participant', true)
        .neq('id', staffId);
      if (roleId != null) countQuery = countQuery.eq('role_id', roleId);
      const [{ data: location }, { count }] = await Promise.all([
        supabase.from('locations').select('name').eq('id', locationId).maybeSingle(),
        countQuery,
      ]);
      if (cancelled) return;
      const locationName = (location as any)?.name ?? 'Your location';
      setSub(`${locationName} · ${count ?? 0} teammates`);
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, staffId, roleId]);

  return sub;
}

/**
 * Shared row list for the former "More" tab's contents, rendered by both the
 * `/more` fallback route (MorePage.tsx) and the header avatar menu
 * (AvatarMenu.tsx) — MOB-1. Kept in exactly one place so the two surfaces
 * cannot drift apart.
 *
 * Base rows (My evaluations, Practice log, Profile, Install the app, Sign
 * out) are the same for every mobile-shell user. "Install the app" (MOB-2)
 * only shows outside standalone mode and only until the "shared device"
 * opt-out is set — tapping it opens the same install instructions as the
 * first-run bottom banner (InstallBanner), reachable here at any time
 * regardless of whether that banner was dismissed. It carries no telemetry:
 * both gates are read from localStorage only, nothing is written except the
 * two existing localStorage flags dismissBanner()/setDeviceOptOut() already
 * used.
 *
 * The lead-gated Team row keeps its existing "{location} · N teammates"
 * subtitle. The management section is built from `navigation` — the SAME
 * role-derived array Layout.tsx's desktop sidebar uses (via useUserRole())
 * — filtered down to non-tab destinations, so a flagged coach/office
 * manager/admin reaches exactly what their role grants on desktop, with no
 * second role map. Renders nothing when there are no management
 * destinations (a plain participant/lead).
 */
export function MoreMenuRows({
  navigation,
  onNavigate,
}: {
  navigation: ManagementNavItem[];
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isLead } = useUserRole();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const teamSub = useTeamRowSub(isLead ? staffProfile?.primary_location_id ?? null : null, staffProfile?.id, isLead ? staffProfile?.role_id ?? null : null);
  const managementLinks = getManagementLinks(navigation);
  const [installOpen, setInstallOpen] = useState(false);
  const [installOptedOut, setInstallOptedOut] = useState(false);
  const showInstallRow = !isStandalone() && !isDeviceOptedOut() && !installOptedOut;

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  const handleInstallSharedDevice = () => {
    setDeviceOptOut();
    setInstallOptedOut(true);
    setInstallOpen(false);
  };

  return (
    <div>
      <div className="rounded-2xl border border-border bg-card px-4">
        <Row label="My evaluations" onClick={() => go('/my-role/evaluations')} />
        <Row label="Practice log" onClick={() => go('/my-role/practice-log')} />
        <Row label="Profile" onClick={() => go('/profile')} />
        {showInstallRow && (
          <Row label="Install the app" icon={Download} onClick={() => setInstallOpen(true)} />
        )}
        <Row
          label="Sign out"
          onClick={() => {
            signOut();
            onNavigate?.();
          }}
        />
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install the app</DialogTitle>
          </DialogHeader>
          <InstallInstructions />
          <button
            type="button"
            onClick={handleInstallSharedDevice}
            className="text-left text-2xs text-muted-foreground underline underline-offset-2"
          >
            Shared device? Never show app prompts here
          </button>
        </DialogContent>
      </Dialog>

      {isLead && (
        <div className="mt-3 rounded-2xl border border-border bg-card px-4">
          <Row label="Your team" sub={teamSub ?? undefined} onClick={() => go('/team')} />
        </div>
      )}

      {/* Management section — only for flagged non-participants whose role
          grants at least one destination beyond Home/Explore. A plain
          participant or lead sees nothing here. */}
      {managementLinks.length > 0 && (
        <div className="mt-3">
          <p className="px-1 pb-1.5 text-2xs font-bold uppercase tracking-widest text-muted-foreground">
            Management
          </p>
          <div className="rounded-2xl border border-border bg-card px-4">
            {managementLinks.map((item) => (
              <Row key={item.href} label={item.name} icon={item.icon} onClick={() => go(item.href)} />
            ))}
          </div>
        </div>
      )}

      {/* DSN-8: guaranteed Pro Moves wordmark in the menu's footer. Quiet,
          non-interactive (not a row — no hover state, no chevron, no
          click), separated from the rows above the same way the sections
          above are separated from each other. */}
      <div className="mt-3 flex justify-center border-t border-border pt-3 cursor-default">
        <ProMovesLogo className="text-xs opacity-70" />
      </div>
    </div>
  );
}
