import { getDomainColorRich } from '@/lib/domainColors';
import { useStaffGlows, type StaffGlow } from '@/hooks/useStaffGlows';

function glowLabel(glow: StaffGlow): string | null {
  // Never guess an identity: only join the parts that actually resolved.
  const parts = [glow.giverName, glow.domainName].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Performance glow history (MOB-5): the staff member's past recognition,
 * most recent first. Placed after the focus hero, near/with ConfidenceCard
 * per the spec's recommendation — both key off domain. Shares
 * `useStaffGlows` with the Home recognition card so the two surfaces read
 * the same data. See docs/specs/mob-5-recognition-card.md.
 */
export function GlowHistory({ staffId }: { staffId: string | undefined }) {
  const { glows, isLoading } = useStaffGlows(staffId);

  // Performance-only (MOB-ADJUST-1 item 5): show recognition only when it's
  // real. No holding/encouragement text here — that stays on Home's
  // RecognitionCard, which is a separate component and untouched.
  if (isLoading || glows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-[15px] font-semibold">Recognition</h2>

      <div className="mt-2">
        {glows.map((glow, idx) => {
          const label = glowLabel(glow);
          return (
            <div key={`${glow.evaluationId}-${idx}`} className="flex items-start gap-2.5 py-3 border-b border-border last:border-none">
              {glow.domainName && (
                <span
                  className="w-2 h-5 rounded-sm flex-none mt-0.5"
                  style={{ backgroundColor: getDomainColorRich(glow.domainName) }}
                />
              )}
              <div className="flex-1 min-w-0">
                {label && (
                  <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                )}
                <p className="text-[13px] leading-snug mt-0.5">{glow.observerGlow}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
