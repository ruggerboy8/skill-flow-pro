import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { BackPill } from '@/components/mobile/BackPill';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Pill = 'missing' | 'open' | 'in';

// Pair each -bg tint with its darker -ink token, not the full-strength
// status color — the full-strength colors fail contrast on the -bg tints
// (~3:1). See round-1 section A for the -ink tokens.
const PILL_CONFIG: Record<Pill, { label: string; bg: string; ink: string }> = {
  missing: { label: 'Missing', bg: '--status-missing-bg', ink: '--missing-ink' },
  open: { label: 'Open', bg: '--status-late-bg', ink: '--late-ink' },
  in: { label: 'In', bg: '--status-complete-bg', ink: '--complete-ink' },
};

function StatusPill({ pill }: { pill: Pill }) {
  const cfg = PILL_CONFIG[pill];
  return (
    <span
      className="text-2xs font-bold uppercase tracking-wide rounded-full px-2.5 py-1 flex-none"
      style={{ backgroundColor: `hsl(var(${cfg.bg}))`, color: `hsl(var(${cfg.ink}))` }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Roster (F.1): leads' teammates at their own location, current-week status.
 */
export default function TeamPage() {
  const navigate = useNavigate();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const locationId = staffProfile?.primary_location_id ?? null;
  const leadStaffId = staffProfile?.id;

  const { data: rosterData } = useQuery({
    queryKey: ['team-roster', locationId, leadStaffId],
    queryFn: async () => {
      if (!locationId || !leadStaffId) return null;

      const [{ data: location }, { data: rosterStaff }] = await Promise.all([
        supabase
          .from('locations')
          .select('name, timezone, conf_due_day, conf_due_time, perf_due_day, perf_due_time')
          .eq('id', locationId)
          .maybeSingle(),
        supabase
          .from('staff')
          .select('id, name, role_id')
          .eq('primary_location_id', locationId)
          .eq('is_participant', true)
          .neq('id', leadStaffId),
      ]);

      const roleIds = [...new Set((rosterStaff ?? []).map((s) => s.role_id).filter((id): id is number => id != null))];
      const { data: roles } = roleIds.length
        ? await supabase.from('roles').select('role_id, role_name').in('role_id', roleIds)
        : { data: [] as { role_id: number; role_name: string | null }[] };
      const roleNameById = new Map((roles ?? []).map((r) => [r.role_id, r.role_name]));

      return {
        locationName: location?.name ?? 'Your location',
        meetingDay: DAY_NAMES[location?.perf_due_day ?? 4] ?? 'Friday',
        roster: (rosterStaff ?? []).map((s) => ({
          id: s.id,
          name: s.name ?? 'Unnamed',
          roleName: s.role_id != null ? roleNameById.get(s.role_id) ?? null : null,
        })),
      };
    },
    enabled: !!locationId && !!leadStaffId,
  });

  // Current-week completion, reusing the coach-surface RPC/hook (same
  // is_complete-style aggregation useMyWeeklyScores uses).
  const { summaries } = useStaffWeeklyScores({ weekOf: null });

  const rosterIds = useMemo(() => new Set((rosterData?.roster ?? []).map((r) => r.id)), [rosterData]);
  const summaryByStaffId = useMemo(() => {
    const map = new Map<string, (typeof summaries)[number]>();
    for (const s of summaries) {
      if (rosterIds.has(s.staff_id)) map.set(s.staff_id, s);
    }
    return map;
  }, [summaries, rosterIds]);

  const pillFor = (staffId: string): Pill => {
    const s = summaryByStaffId.get(staffId);
    if (!s || s.conf_count === 0) return 'missing';
    if (s.assignment_count > 0 && s.conf_count === s.assignment_count && s.perf_count === s.assignment_count) return 'in';
    return 'open';
  };

  const checkedInCount = (rosterData?.roster ?? []).filter((r) => pillFor(r.id) !== 'missing').length;
  const total = rosterData?.roster.length ?? 0;

  return (
    <div className="space-y-4">
      <BackPill label="Home" to="/" />
      <div>
        <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          {rosterData?.locationName ?? ' '}
        </p>
        <h1 className="text-[22px] font-bold tracking-tight mt-0.5">Your team</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">This week</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[30px] font-extrabold tabular-nums">{checkedInCount}</span>
          <span className="text-sm text-muted-foreground">of {total} checked in</span>
        </div>
        {rosterData?.meetingDay && (
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Check-out is due {rosterData.meetingDay}, the day of your meeting.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card px-4">
        {(rosterData?.roster ?? []).map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => navigate(`/team/${member.id}`)}
            className="flex w-full items-center gap-2.5 py-3.5 min-h-[56px] border-b border-border last:border-none text-left active:bg-primary/5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold truncate">{member.name}</p>
              {member.roleName && <p className="text-[11px] text-muted-foreground mt-0.5">{member.roleName}</p>}
            </div>
            <StatusPill pill={pillFor(member.id)} />
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
          </button>
        ))}
        {rosterData && rosterData.roster.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No teammates at your location yet.</p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Tap a teammate to see how their quarter is going.
      </p>
    </div>
  );
}
