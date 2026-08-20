import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { BackPill } from '@/components/mobile/BackPill';
import { useMobileShell } from '@/hooks/useMobileShell';
import { useCraftAtlas } from '@/hooks/useCraftAtlas';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';
import { ProMoveRow } from '@/components/my-role/ProMoveRow';
import { ProMoveDrawer } from '@/components/my-role/ProMoveDrawer';
import { getDomainColorVar, getDomainPastelVar, getDomainInk } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { levelForScore, SCORE_LEVEL_BUCKET } from '@/lib/scoreLevel';

/**
 * Area page — one skill area's coach context + moves (Concept B, screen 2).
 * Route: /my-role/area/:competencyId (added in App.tsx). Mobile-shell only;
 * on desktop (no entry point today) this redirects to the competency's
 * existing domain page instead of duplicating it. See
 * docs/features/explore-my-role-build-instructions.md section C.
 */
export default function CraftAtlasArea() {
  const { competencyId } = useParams<{ competencyId: string }>();
  const isMobileShell = useMobileShell();
  const { data, isLoading } = useCraftAtlas();
  const [selectedMove, setSelectedMove] = useState<ProMoveDetail | null>(null);

  const competency = data?.competencies.find((c) => String(c.competency_id) === competencyId);

  if (!isMobileShell) {
    if (isLoading) return null;
    return (
      <Navigate to={competency ? `/my-role/domain/${getDomainSlug(competency.domainName)}` : '/my-role'} replace />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <BackPill label="Explore" to="/my-role" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  if (!competency) {
    return (
      <div className="space-y-4">
        <BackPill label="Explore" to="/my-role" />
        <p className="text-sm text-muted-foreground">We couldn't find that skill area.</p>
      </div>
    );
  }

  const level = levelForScore(competency.observerScore);
  const hasNote = !!competency.observerNote;
  const showCoachCard = level !== null || hasNote;
  const ink = getDomainInk(competency.domainName);
  const metaBits = [data.periodLabel, data.evaluatorFirstName].filter(Boolean);

  return (
    <div className="space-y-4">
      <BackPill label="Explore" to="/my-role" />

      {/* Hero */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: getDomainPastelVar(competency.domainName) }}>
        <p className="text-2xs font-extrabold uppercase tracking-widest" style={{ color: getDomainColorVar(competency.domainName) }}>
          {competency.domainName}
        </p>
        <h1 className="text-[22px] font-bold tracking-tight mt-1" style={{ color: ink }}>
          {competency.title}
        </h1>
        {competency.description && (
          <p className="text-[13.5px] leading-relaxed mt-2" style={{ color: ink, opacity: 0.85 }}>
            {competency.description}
          </p>
        )}
      </div>

      {/* Moves — the craft leads here, not the grade. */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {competency.proMoves.length} move{competency.proMoves.length === 1 ? '' : 's'} in this area
        </h2>
        <div className="space-y-1">
          {competency.proMoves.map((move) => (
            <ProMoveRow key={move.action_id} move={move} onClick={() => setSelectedMove(move)} />
          ))}
        </div>
      </div>

      {/* Coach card — de-emphasized: grading is reachable but secondary,
          so it sits below the moves in a muted style rather than leading
          the page (see docs/specs/mob-6-craft-atlas.md "De-emphasize the
          graded tiles"). Only when there is something to show. */}
      {showCoachCard && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {level && (
              <span
                className="text-2xs font-semibold whitespace-nowrap opacity-80"
                style={{ color: `hsl(var(--score-${SCORE_LEVEL_BUCKET[level]}-ink))` }}
              >
                Coach level: {level}
              </span>
            )}
            {metaBits.length > 0 && (
              <span className="text-2xs font-semibold text-muted-foreground">{metaBits.join(' · ')}</span>
            )}
          </div>
          {hasNote && (
            <p className="text-[13px] leading-relaxed text-muted-foreground mt-2.5 italic">
              "{competency.observerNote}"
            </p>
          )}
        </div>
      )}

      {/* Study Drawer — same component/props DomainDetail.tsx uses */}
      <ProMoveDrawer
        open={!!selectedMove}
        onOpenChange={(open) => !open && setSelectedMove(null)}
        move={selectedMove}
        domainName={competency.domainName}
      />
    </div>
  );
}
