import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Volume2, Video, Link as LinkIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BackPill } from '@/components/mobile/BackPill';
import { ExploreBreadcrumb, type ExploreBreadcrumbItem } from '@/components/mobile/ExploreBreadcrumb';
import { useMobileShell } from '@/hooks/useMobileShell';
import { useCraftAtlas } from '@/hooks/useCraftAtlas';
import { useExploredMoves } from '@/hooks/useExploredMoves';
import { supabase } from '@/integrations/supabase/client';
import { groupResourceTypesByAction } from '@/lib/proMoveResourceTypes';
import { getDomainColorVarRaw, getDomainInk } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';

const RESOURCE_ICONS: Record<string, typeof MessageCircle> = {
  script: MessageCircle,
  audio: Volume2,
  video: Video,
  link: LinkIcon,
};

/**
 * Area page — the Explore drill's competency level (level 3). Route:
 * /my-role/area/:competencyId. Mobile-shell only; on desktop (no entry point
 * today) this redirects to the competency's domain page instead of
 * duplicating it. This is the regression fix from the old app: the page is
 * about *that* competency, not the whole domain. See
 * docs/specs/mob-explore-rebuild.md §2 level 3.
 */
export default function CraftAtlasArea() {
  const { competencyId } = useParams<{ competencyId: string }>();
  const navigate = useNavigate();
  const isMobileShell = useMobileShell();
  const { data, isLoading } = useCraftAtlas();
  const { countFor } = useExploredMoves();

  const competency = data?.competencies.find((c) => String(c.competency_id) === competencyId);
  const actionIds = competency?.proMoves.map((m) => m.action_id) ?? [];

  // Small materials icon row per move (script/audio/video/link) — one query
  // for the whole competency rather than a per-move fetch. Only enabled once
  // we know which action_ids to ask for.
  const { data: resourceTypesByAction } = useQuery({
    queryKey: ['craft-atlas-area-resource-types', competency?.competency_id, actionIds],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('pro_move_resources')
        .select('action_id, type')
        .in('action_id', actionIds)
        .eq('status', 'active');
      return groupResourceTypesByAction(rows || []);
    },
    enabled: actionIds.length > 0,
  });

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

  const ink = getDomainInk(competency.domainName);
  const colorVar = getDomainColorVarRaw(competency.domainName);
  const openedCount = countFor(actionIds);
  const domainSlug = getDomainSlug(competency.domainName);

  const breadcrumbItems: ExploreBreadcrumbItem[] = [
    { label: 'Explore', to: '/my-role' },
    { label: competency.domainName, to: `/my-role/domain/${domainSlug}` },
    { label: competency.subtitle || competency.title },
  ];

  return (
    <div className="space-y-4">
      <BackPill label={competency.domainName} to={`/my-role/domain/${domainSlug}`} />
      <ExploreBreadcrumb items={breadcrumbItems} domainName={competency.domainName} />

      <div>
        <h1 className="text-[22px] font-bold tracking-tight leading-tight">{competency.title}</h1>
        {competency.subtitle && (
          <p className="text-[13px] font-semibold mt-1" style={{ color: ink }}>
            {competency.subtitle}
          </p>
        )}

        {/* Formal definition — a quiet box beneath the heading. */}
        {competency.formalDescription && (
          <p className="text-[15px] leading-relaxed mt-3 text-foreground">{competency.formalDescription}</p>
        )}

        {/* Aspirational identity line — the app describing the person at
            their best, set apart as a serif block quote. */}
        {competency.friendlyDescription && (
          <blockquote
            className="font-serif text-[16px] italic leading-relaxed mt-4 rounded-r-xl py-3.5 px-4"
            style={{
              backgroundColor: `hsl(${colorVar} / 0.05)`,
              borderLeft: `3px solid hsl(${colorVar})`,
              color: ink,
            }}
          >
            {competency.friendlyDescription}
          </blockquote>
        )}
      </div>

      {/* Moves */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {competency.proMoves.length} Pro Move{competency.proMoves.length === 1 ? '' : 's'}
          {openedCount > 0 ? ` · ${openedCount} opened` : ''}
        </h2>
        <div className="space-y-2">
          {competency.proMoves.map((move, i) => {
            const types = resourceTypesByAction?.[move.action_id];
            const icons = types ? Array.from(types).filter((t) => RESOURCE_ICONS[t]) : [];
            return (
              <button
                key={move.action_id}
                type="button"
                onClick={() => navigate(`/my-role/move/${move.action_id}`)}
                className="w-full text-left rounded-2xl border border-border bg-card p-3.5 flex items-stretch gap-3 active:scale-[0.99] transition-transform"
              >
                <span
                  className="h-[26px] w-[26px] rounded-lg flex-none flex items-center justify-center text-2xs font-bold mt-0.5"
                  style={{ backgroundColor: `hsl(${colorVar} / 0.1)`, color: ink }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium leading-relaxed">{move.action_statement}</span>
                  {icons.length > 0 && (
                    <span className="inline-flex items-center gap-2 mt-2.5">
                      {icons.map((type) => {
                        const Icon = RESOURCE_ICONS[type];
                        return <Icon key={type} className="h-4 w-4 opacity-70" style={{ color: ink }} />;
                      })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
