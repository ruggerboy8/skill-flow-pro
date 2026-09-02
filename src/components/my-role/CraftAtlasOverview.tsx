import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shuffle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCraftAtlas } from '@/hooks/useCraftAtlas';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useRoleDisplayNames } from '@/hooks/useRoleDisplayNames';
import { DOMAIN_ORDER, ROLE_CONTENT, getRoleTypeFromArchetype, type RoleType } from '@/lib/content/roleDefinitions';
import { getDomainColorVar, getDomainColorVarRaw, getDomainPastelVar, getDomainInk } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { pickRandomMoveActionId } from '@/lib/exploreNav';
import { AtlasSearch } from '@/components/my-role/AtlasSearch';

/**
 * Explore landing — the four domains as doorways, not graded squares
 * (Explore drill rebuild, level 1). Mobile-shell only; the branch lives in
 * RoleRadar.tsx so desktop's route table and RoleRadar rendering stay
 * untouched. See docs/specs/mob-explore-rebuild.md §2 level 1.
 *
 * No scores, no level pills, no "How I'm graded" — grading lives on
 * Performance. Search is kept here at the founder's explicit request; this
 * deviates from the written spec's "remove search" line, which is
 * superseded for this build.
 */
export default function CraftAtlasOverview() {
  const navigate = useNavigate();
  const { data, isLoading } = useCraftAtlas();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const { resolve: resolveRoleName } = useRoleDisplayNames();
  const [searchActive, setSearchActive] = useState(false);

  const archetype = (staffProfile as any)?.roles?.archetype_code ?? null;
  const roleType: RoleType = getRoleTypeFromArchetype(archetype, staffProfile?.role_id);

  // Eyebrow: the org-scoped role display name when we have both a role_id to
  // resolve it against and a platform fallback name; otherwise fall back to
  // the plain "Explore" label rather than showing nothing.
  const platformRoleName = staffProfile?.roles?.role_name ?? null;
  const roleEyebrow =
    staffProfile?.role_id != null && platformRoleName
      ? resolveRoleName(staffProfile.role_id, platformRoleName)
      : platformRoleName ?? 'Explore';

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full max-w-xs" />
        </div>
        <Skeleton className="h-12 rounded-2xl" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const totalMoves = data.competencies.reduce((sum, c) => sum + c.proMoves.length, 0);

  function handleSurpriseMe() {
    const actionId = pickRandomMoveActionId(data.competencies);
    if (actionId != null) navigate(`/my-role/move/${actionId}`);
  }

  return (
    <div className="space-y-5">
      {/* Header — editorial serif title with the staff member's role as the
          eyebrow, matching docs/prototypes/explore-drill-prototype.html's
          landing treatment. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">{roleEyebrow}</p>
          <h1 className="font-serif text-[22px] font-semibold tracking-tight -mt-1">Explore your role</h1>
          <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
            Wander the {DOMAIN_ORDER.length} domains of your craft. {data.competencies.length} skill areas,{' '}
            {totalMoves} Pro Moves.
          </p>
        </div>
        {totalMoves > 0 && (
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="inline-flex flex-none items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground active:scale-95 transition-transform"
          >
            <Shuffle className="h-4 w-4" />
            Surprise me
          </button>
        )}
      </div>

      {/* Search — kept on the landing at the founder's request (deviates
          from the written spec's "no search here" line). Client-side over
          the corpus useCraftAtlas already loaded; an active query collapses
          the doorways below into a flat result list. */}
      <AtlasSearch competencies={data.competencies} onActiveChange={setSearchActive} />

      {!searchActive && (
        <div className="flex flex-col gap-3">
          {DOMAIN_ORDER.map((domain) => {
            const list = data.competencies.filter((c) => c.domainName === domain);
            if (list.length === 0) return null;
            const moveCount = list.reduce((sum, c) => sum + c.proMoves.length, 0);
            // Domain doorway one-liner: ROLE_CONTENT's existing description
            // field, role-aware. Omitted (not a placeholder) where a domain
            // has none — see docs/specs/mob-explore-rebuild.md §2 level 1.
            const oneLiner = ROLE_CONTENT[roleType]?.[domain]?.description ?? null;
            const ink = getDomainInk(domain);
            const colorVar = getDomainColorVarRaw(domain);

            return (
              <button
                key={domain}
                type="button"
                onClick={() => navigate(`/my-role/domain/${getDomainSlug(domain)}`)}
                className="relative overflow-hidden text-left rounded-2xl border p-4 active:scale-[0.985] transition-transform"
                style={{
                  borderColor: `hsl(${colorVar} / 0.35)`,
                  background: `radial-gradient(120% 120% at 100% 0%, ${getDomainPastelVar(domain)} 0%, hsl(var(--card)) 62%)`,
                }}
              >
                <span className="font-serif text-[22px] font-semibold leading-tight" style={{ color: ink }}>
                  {domain}
                </span>
                {oneLiner && (
                  <p className="text-[13px] leading-relaxed mt-1.5 max-w-[90%] text-muted-foreground">{oneLiner}</p>
                )}
                <div className="flex items-center gap-2 mt-3.5">
                  <span
                    className="text-2xs font-bold whitespace-nowrap rounded-full px-2.5 py-1"
                    style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: ink }}
                  >
                    {list.length} area{list.length === 1 ? '' : 's'}
                  </span>
                  <span
                    className="text-2xs font-bold whitespace-nowrap rounded-full px-2.5 py-1"
                    style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: ink }}
                  >
                    {moveCount} Pro Move{moveCount === 1 ? '' : 's'}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold" style={{ color: ink }}>
                    Enter <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
