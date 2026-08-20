import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, Link as LinkIcon, Pause, Video, Volume2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BackPill } from '@/components/mobile/BackPill';
import { ExploreBreadcrumb, type ExploreBreadcrumbItem } from '@/components/mobile/ExploreBreadcrumb';
import { useCraftAtlas } from '@/hooks/useCraftAtlas';
import { useProMoveResources } from '@/hooks/useProMoveResources';
import { useExploredMoves } from '@/hooks/useExploredMoves';
import { useMobileShell } from '@/hooks/useMobileShell';
import { findMoveAncestors, getNextMove } from '@/lib/exploreNav';
import { getDomainColorVarRaw, getDomainInk } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';

/**
 * Pro Move page — the Explore drill's move level (level 4, new this build).
 * Route: /my-role/move/:actionId. `:actionId` alone is enough — the
 * containing competency and domain are derived from useCraftAtlas data (see
 * findMoveAncestors). Description is the unlabeled centerpiece; script/audio/
 * video/link render with no section labels when present and are simply
 * omitted when absent. See docs/specs/mob-explore-rebuild.md §2 level 4.
 */
export default function ExploreMove() {
  const { actionId: actionIdParam } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const actionId = actionIdParam ? Number(actionIdParam) : NaN;
  const validActionId = Number.isFinite(actionId);
  const isMobileShell = useMobileShell();

  const { data, isLoading } = useCraftAtlas();
  const { markOpened } = useExploredMoves();

  const ancestors = data && validActionId ? findMoveAncestors(data.competencies, actionId) : null;

  const { loading: resourcesLoading, content } = useProMoveResources(
    validActionId ? actionId : null,
    ancestors?.move.description
  );

  useEffect(() => {
    if (validActionId) markOpened(actionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId, validActionId]);

  if (!validActionId) {
    return <Navigate to="/my-role" replace />;
  }

  // Desktop has no Explore drill entry today; redirect to the move's domain
  // page for parity with the /my-role/area/:competencyId redirect — see
  // docs/specs/mob-explore-rebuild.md §4.
  if (!isMobileShell) {
    if (isLoading) return null;
    return <Navigate to={ancestors ? `/my-role/domain/${getDomainSlug(ancestors.competency.domainName)}` : '/my-role'} replace />;
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  if (!ancestors) {
    return (
      <div className="space-y-4">
        <BackPill label="Explore" to="/my-role" />
        <p className="text-sm text-muted-foreground">We couldn't find that Pro Move.</p>
      </div>
    );
  }

  const { competency, move } = ancestors;
  const ink = getDomainInk(competency.domainName);
  const colorVar = getDomainColorVarRaw(competency.domainName);
  const domainSlug = getDomainSlug(competency.domainName);
  const nextMove = getNextMove(competency, actionId);

  const breadcrumbItems: ExploreBreadcrumbItem[] = [
    { label: 'Explore', to: '/my-role' },
    { label: competency.domainName, to: `/my-role/domain/${domainSlug}` },
    { label: competency.subtitle || competency.title, to: `/my-role/area/${competency.competency_id}` },
  ];

  const hasScript = !!content.script;
  const hasAudio = !!content.audio_url;
  const hasVideo = !!content.video_id;

  return (
    <div className="space-y-4">
      <BackPill label={competency.title} to={`/my-role/area/${competency.competency_id}`} />
      <ExploreBreadcrumb items={breadcrumbItems} domainName={competency.domainName} />

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-2xs font-extrabold uppercase tracking-widest rounded-full px-2.5 py-1"
            style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: ink }}
          >
            {competency.domainName}
          </span>
          {competency.subtitle && (
            <span className="text-2xs font-semibold text-muted-foreground">{competency.subtitle}</span>
          )}
        </div>
        <h1 className="font-serif text-[22px] font-semibold leading-snug mt-3 text-balance">
          {move.action_statement}
        </h1>
      </div>

      {/* Description — the centerpiece, no label above it. Known instantly
          from useCraftAtlas, so it doesn't wait on the resources fetch. */}
      {move.description && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: `hsl(${colorVar} / 0.06)`, border: `1px solid hsl(${colorVar} / 0.18)` }}
        >
          <p className="text-[16px] leading-relaxed">{move.description}</p>
        </div>
      )}

      {/* Materials — no section labels. Omitted entirely while absent. */}
      {!resourcesLoading && hasScript && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: `hsl(${colorVar} / 0.05)`, borderLeft: `4px solid hsl(${colorVar})` }}
        >
          <p className="font-serif text-[17px] leading-relaxed">&ldquo;{content.script}&rdquo;</p>
          {hasAudio && (
            <div className="mt-3.5">
              <AudioSpeakerButton url={content.audio_url!} colorVar={colorVar} ink={ink} />
            </div>
          )}
        </div>
      )}
      {!resourcesLoading && !hasScript && hasAudio && (
        <AudioSpeakerButton url={content.audio_url!} colorVar={colorVar} ink={ink} />
      )}

      {!resourcesLoading && hasVideo && (
        <a
          href={`https://www.youtube.com/watch?v=${content.video_id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-border p-3.5"
        >
          <span
            className="h-[30px] w-[30px] rounded-lg flex items-center justify-center flex-none"
            style={{ backgroundColor: `hsl(${colorVar} / 0.1)`, color: ink }}
          >
            <Video className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium">Watch the walkthrough</span>
        </a>
      )}

      {!resourcesLoading &&
        content.links.map((link) => (
          <a
            key={link.id}
            href={link.url || '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-border p-3.5"
          >
            <span
              className="h-[30px] w-[30px] rounded-lg flex items-center justify-center flex-none"
              style={{ backgroundColor: `hsl(${colorVar} / 0.1)`, color: ink }}
            >
              <LinkIcon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">{link.title || 'Open the reference'}</span>
          </a>
        ))}

      {/* Momentum footer — a plain "Next move" button, no preview text, no
          checkbox. Wraps at the end of the competency. Omitted when the
          competency has only this one move. */}
      {nextMove && (
        <button
          type="button"
          onClick={() => navigate(`/my-role/move/${nextMove.action_id}`, { replace: true })}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 mt-4 text-[15px] font-semibold active:scale-[0.99] transition-transform"
          style={{ backgroundColor: `hsl(${colorVar} / 0.07)`, border: `1px solid hsl(${colorVar} / 0.35)`, color: ink }}
        >
          Next move <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AudioSpeakerButton({ url, colorVar, ink }: { url: string; colorVar: string; ink: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) audio.pause();
          else audio.play();
        }}
        aria-label={playing ? 'Pause' : 'Hear this said aloud'}
        className="h-11 w-11 rounded-full flex items-center justify-center flex-none active:scale-95 transition-transform"
        style={{ backgroundColor: `hsl(${colorVar} / ${playing ? 0.26 : 0.14})`, color: ink }}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
