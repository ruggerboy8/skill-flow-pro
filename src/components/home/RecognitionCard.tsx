import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useStaffGlows } from '@/hooks/useStaffGlows';
import { pickEncouragementLine } from '@/lib/genericEncouragement';

/**
 * Home recognition card (MOB-5, HOME_FEED_ORDER id 'recognition'). Always
 * warm, never empty (spec decisions log #3): shows the featured glow — the
 * most recent glow in the staff member's lowest-confidence domain, falling
 * back to the most recent glow in any domain — attributed to the giver by
 * name. With no glow yet, shows rotating generic encouragement instead of an
 * empty shell. Exactly one glow, never a stack. See
 * docs/specs/mob-5-recognition-card.md.
 */
export function RecognitionCard() {
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;
  const { featuredGlow, isLoading } = useStaffGlows(staffId);

  // Avoid a flash of the encouragement fallback before the glow query
  // resolves; the card simply isn't in the feed yet while loading.
  if (isLoading) return null;

  const iconBadge = (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
      style={{ backgroundColor: 'hsl(var(--win-growth-border))', color: 'hsl(var(--win-growth))' }}
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );

  if (!featuredGlow) {
    const line = pickEncouragementLine();
    return (
      <Card
        className="border"
        style={{ borderColor: 'hsl(var(--win-growth-border))', backgroundColor: 'hsl(var(--win-growth-bg))' }}
      >
        <CardContent className="pt-4 flex items-start gap-3">
          {iconBadge}
          <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--win-growth))' }}>
            {line}
          </p>
        </CardContent>
      </Card>
    );
  }

  const eyebrow = featuredGlow.giverName ? `${featuredGlow.giverName} noticed` : 'Noticed';

  return (
    <Card
      className="border"
      style={{ borderColor: 'hsl(var(--win-growth-border))', backgroundColor: 'hsl(var(--win-growth-bg))' }}
    >
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start gap-3">
          {iconBadge}
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--win-growth))' }}>
              {eyebrow}
            </p>
            {featuredGlow.domainName && (
              <p className="text-2xs text-muted-foreground mt-0.5">{featuredGlow.domainName}</p>
            )}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{featuredGlow.observerGlow}</p>
      </CardContent>
    </Card>
  );
}
