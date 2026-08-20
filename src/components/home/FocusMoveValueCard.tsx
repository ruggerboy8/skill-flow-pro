import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, MessageCircle, PlayCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useCurrentFocus } from '@/hooks/useCurrentFocus';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';
import { selectFocusMoveValueTier, type FocusValueTier } from '@/lib/focusMoveValue';
import { getDomainColorRichRaw } from '@/lib/domainColors';

const TIER_ICON: Record<FocusValueTier, typeof BookOpen> = {
  script: MessageCircle,
  audio: PlayCircle,
  description: BookOpen,
  statement: BookOpen,
};

/**
 * Home value card (MOB-3): gives the staff member something useful about
 * their own quarterly focus move instead of only asking for a score.
 *
 * Fallback chain (script/audio -> description -> action_statement) lives in
 * `src/lib/focusMoveValue.ts`; this component only resolves the data and
 * renders whichever tier that function picks. Reuses `useCurrentFocus` (the
 * same query `CurrentFocusCard` uses) rather than a second divergent query,
 * and reuses the existing `LearnerLearnDrawer` for script/audio playback
 * instead of a new player.
 *
 * Doctors (role_id 4) stay on the description tier for v1 — the parallel
 * `doctor_*` content system is intentionally not wired in here (John,
 * 2026-08-20).
 */
export function FocusMoveValueCard() {
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;
  const { data: focus } = useCurrentFocus(staffId);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Open question (spec, unresolved): with multiple focus moves, which one?
  // We show the first until that's decided — showing "the lowest-confidence
  // one" would require a confidence-score read beyond the resources already
  // queried here, which the spec's acceptance criteria don't allow for MOB-3.
  const focusItem = focus?.type === 'focus' ? focus.items[0] : null;
  const actionId = focusItem?.actionId;

  const { data: resourceData } = useQuery({
    queryKey: ['focus-move-value-resources', actionId],
    queryFn: async () => {
      const [{ data: moveData }, { data: resources }] = await Promise.all([
        supabase.from('pro_moves').select('description').eq('action_id', actionId!).single(),
        supabase
          .from('pro_move_resources')
          .select('type, content_md, url')
          .eq('action_id', actionId!)
          .eq('status', 'active')
          .order('display_order'),
      ]);

      const script = resources?.find(r => r.type === 'script')?.content_md ?? null;
      const audioResource = resources?.find(r => r.type === 'audio');
      let audioUrl: string | null = null;
      if (audioResource?.url) {
        audioUrl = supabase.storage.from('pro-move-audio').getPublicUrl(audioResource.url).data.publicUrl;
      }

      return {
        description: moveData?.description ?? null,
        script,
        audioUrl,
      };
    },
    enabled: !!actionId,
    staleTime: 1000 * 60 * 5,
  });

  if (!focusItem || !actionId) return null;

  // Still resolving resources — render nothing rather than a flash of the
  // wrong tier (e.g. "How to do this move" before we've checked for a script).
  if (resourceData === undefined) return null;

  const selection = selectFocusMoveValueTier({
    script: resourceData.script,
    audioUrl: resourceData.audioUrl,
    description: resourceData.description,
    actionStatement: focusItem.statement,
  });

  // Should not happen in practice (action_statement has ~100% coverage), but
  // the card must never render an empty shell.
  if (!selection) return null;

  // Bare "statement" tier: no script, audio, or description exists, so this
  // card would just restate the action statement that `CurrentFocusCard`
  // already shows above it. Render nothing rather than a second card saying
  // the same thing.
  if (selection.tier === 'statement') return null;

  const Icon = TIER_ICON[selection.tier];
  const richColor = getDomainColorRichRaw(focusItem.domainName);

  // For the script/audio tiers, the content lives in the drawer. The
  // description tier renders inline as intentional teaching content, not a
  // degraded fallback (matches ProMoveDrawer's "The Move" framing).
  const bodyText = selection.tier === 'description' ? resourceData.description : null;

  return (
    <>
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
            Your focus move
          </p>
          {bodyText && (
            <div
              className="text-sm leading-relaxed line-clamp-4 p-3.5 rounded-2xl border"
              style={{
                backgroundColor: `hsl(${richColor} / 0.04)`,
                borderColor: `hsl(${richColor} / 0.15)`,
              }}
            >
              {bodyText}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {selection.label}
          </Button>
        </CardContent>
      </Card>
      <LearnerLearnDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        actionId={actionId}
        proMoveTitle={focusItem.statement}
        domainName={focusItem.domainName}
      />
    </>
  );
}
