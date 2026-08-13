import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { supabase } from '@/integrations/supabase/client';

function Row({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 py-3.5 min-h-[52px] border-b border-border last:border-none text-left active:bg-primary/5"
    >
      <span>
        {label}
        {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
    </button>
  );
}

/** "{location name} · {n} teammates" — Copy appendix. */
function useTeamRowSub(locationId: string | null, staffId: string | undefined) {
  const [sub, setSub] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId || !staffId) return;
    let cancelled = false;
    (async () => {
      const [{ data: location }, { count }] = await Promise.all([
        supabase.from('locations').select('name').eq('id', locationId).maybeSingle(),
        supabase
          .from('staff')
          .select('id', { count: 'exact', head: true })
          .eq('primary_location_id', locationId)
          .eq('is_participant', true)
          .neq('id', staffId),
      ]);
      if (cancelled) return;
      const locationName = (location as any)?.name ?? 'Your location';
      setSub(`${locationName} · ${count ?? 0} teammates`);
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, staffId]);

  return sub;
}

/**
 * More tab: rows to secondary destinations, plus (leads only) the Team
 * surface. See docs/features/mobile-build-instructions.md section B.4.
 * Notifications row intentionally omitted — no backing feature yet.
 */
export default function MorePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isLead } = useUserRole();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const teamSub = useTeamRowSub(isLead ? staffProfile?.primary_location_id ?? null : null, staffProfile?.id);

  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-tight">More</h1>

      <div className="mt-3 rounded-2xl border border-border bg-card px-4">
        <Row label="My evaluations" onClick={() => navigate('/my-role/evaluations')} />
        <Row label="Practice log" onClick={() => navigate('/my-role/practice-log')} />
        <Row label="Profile" onClick={() => navigate('/profile')} />
        <Row label="Sign out" onClick={() => signOut()} />
      </div>

      {isLead && (
        <div className="mt-3 rounded-2xl border border-border bg-card px-4">
          <Row label="Your team" sub={teamSub ?? undefined} onClick={() => navigate('/team')} />
        </div>
      )}
    </div>
  );
}
