import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useMyWeeklyScores } from '@/hooks/useMyWeeklyScores';
import { getDomainColorRich, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { DOMAIN_ORDER } from '@/lib/content/roleDefinitions';
import { computeDomainAverages } from '@/lib/lowestConfidenceDomain';
import { format, parseISO, subWeeks } from 'date-fns';

type Window = '3w' | '6w' | 'quarter';
const WINDOW_WEEKS: Record<Window, number> = { '3w': 3, '6w': 6, quarter: 13 };

function scoreBucket(avg: number): 1 | 2 | 3 | 4 {
  if (avg >= 3.5) return 4;
  if (avg >= 2.5) return 3;
  if (avg >= 1.5) return 2;
  return 1;
}

function ScoreChip({ value }: { value: number }) {
  const bucket = scoreBucket(value);
  return (
    <span
      className="inline-flex items-center justify-center min-w-[32px] h-7 px-1.5 rounded-lg font-bold text-[13px]"
      style={{ backgroundColor: `hsl(var(--score-${bucket}-bg))`, color: `hsl(var(--score-${bucket}-ink))` }}
    >
      {value.toFixed(1).replace(/\.0$/, '')}
    </span>
  );
}

/**
 * Confidence (window toggle) + "Moves ... still building" — one card, shared
 * between the Performance tab (subject='you') and the lead's Team staff
 * detail (subject='them'). See docs/features/mobile-build-instructions.md
 * sections E.3 and F.2.4.
 *
 * Data: useMyWeeklyScores({ staffId }) — passing a staffId (own or a
 * teammate's) routes it through the same get_staff_all_weekly_scores RPC
 * useStaffAllWeeklyScores uses, so both callers share one code path.
 * Deliberately no sparklines/trend charts (spec: do not add them).
 */
export function ConfidenceCard({ staffId, subject }: { staffId: string | undefined; subject: 'you' | 'them' }) {
  const navigate = useNavigate();
  const [activeWindow, setActiveWindow] = useState<Window>('quarter');
  const { rawData, loading } = useMyWeeklyScores({ staffId });

  const cutoff = useMemo(() => subWeeks(new Date(), WINDOW_WEEKS[activeWindow]), [activeWindow]);

  const inWindow = useMemo(
    () => rawData.filter((r) => r.week_of && parseISO(r.week_of) >= cutoff),
    [rawData, cutoff]
  );

  // Shared with useLowestConfidenceDomain (MOB-5) so this card and the
  // recognition-card glow selector can't compute the domain average
  // differently. See src/lib/lowestConfidenceDomain.ts.
  const domainAverages = useMemo(() => computeDomainAverages(inWindow), [inWindow]);

  const stillBuilding = useMemo(() => {
    return inWindow
      .filter((r) => r.confidence_score != null && r.confidence_score <= 2)
      .sort((a, b) => {
        const weekCompare = new Date(b.week_of).getTime() - new Date(a.week_of).getTime();
        if (weekCompare !== 0) return weekCompare;
        return (a.confidence_score ?? 0) - (b.confidence_score ?? 0);
      });
  }, [inWindow]);

  const stillBuildingHeading = subject === 'you' ? "Moves you're still building" : "Moves they're still building";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Confidence</h2>
        <div className="inline-flex gap-1">
          {(['3w', '6w', 'quarter'] as Window[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setActiveWindow(w)}
              aria-pressed={activeWindow === w}
              className="min-h-[44px] px-3 rounded-full border text-[11px] font-bold uppercase"
              style={
                activeWindow === w
                  ? { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' }
                  : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
              }
            >
              {w === '3w' ? '3w' : w === '6w' ? '6w' : 'Quarter'}
            </button>
          ))}
        </div>
      </div>

      {/* Top half: domain averages, fixed order, no sparklines */}
      <div className="mt-3">
        {DOMAIN_ORDER.map((domain) => {
          const entry = domainAverages.get(domain);
          const avg = entry && entry.count > 0 ? entry.sum / entry.count : null;
          const richColor = `hsl(${getDomainColorRichRaw(domain)})`;
          return (
            <div key={domain} className="flex items-center gap-2.5 py-2 border-b border-border last:border-none">
              <span className="w-2 h-5 rounded-sm flex-none" style={{ backgroundColor: richColor }} />
              <span className="flex-1 text-[13px]">{domain}</span>
              {avg != null ? <ScoreChip value={avg} /> : <span className="text-xs text-muted-foreground">—</span>}
            </div>
          );
        })}
      </div>

      <div className="my-4 border-t border-border" />

      {/* Bottom half: still building */}
      <div>
        <h3 className="text-[15px] font-semibold">{stillBuildingHeading}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rated 1 or 2 in this stretch. Tap one for its learning resources.
        </p>

        {!loading && stillBuilding.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nothing rated low in this stretch. Nice work.
          </p>
        )}

        {stillBuilding.map((row, idx) => {
          const richColor = getDomainColorRich(row.domain_name);
          return (
            <button
              key={`${row.action_id}-${row.week_of}-${idx}`}
              type="button"
              onClick={() => navigate(`/my-role/domain/${getDomainSlug(row.domain_name)}`)}
              className="flex w-full items-stretch gap-2.5 py-3 min-h-[44px] border-b border-border last:border-none text-left active:bg-primary/5"
            >
              <span className="w-2 rounded-sm flex-none" style={{ backgroundColor: richColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug">{row.action_statement}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Week of {format(parseISO(row.week_of), 'MMM d')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-none">
                {row.confidence_score != null && <ScoreChip value={row.confidence_score} />}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
