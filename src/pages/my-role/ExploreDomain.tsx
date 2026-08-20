import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BackPill } from '@/components/mobile/BackPill';
import { ExploreBreadcrumb, type ExploreBreadcrumbItem } from '@/components/mobile/ExploreBreadcrumb';
import { useCraftAtlas, type AtlasCompetency } from '@/hooks/useCraftAtlas';
import { useExploredMoves } from '@/hooks/useExploredMoves';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { ROLE_CONTENT, getRoleTypeFromArchetype, type RoleType } from '@/lib/content/roleDefinitions';
import { getDomainColorVar, getDomainColorVarRaw, getDomainPastelVar, getDomainInk } from '@/lib/domainColors';
import { getDomainNameFromSlug } from '@/lib/domainUtils';

const MAX_DOTS = 7;

/**
 * Explore domain page (level 2) — a colored hero for the domain, then a list
 * of its competency rows led by their tagline, with discovery dots. Mobile
 * branch reached from DomainDetail.tsx when useMobileShell() is true; desktop
 * keeps the existing accordion render untouched. See
 * docs/specs/mob-explore-rebuild.md §2 level 2.
 */
export default function ExploreDomain() {
  const { domainSlug = '' } = useParams<{ domainSlug: string }>();
  const navigate = useNavigate();
  const domainName = getDomainNameFromSlug(domainSlug);
  const { data, isLoading } = useCraftAtlas();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const { countFor } = useExploredMoves();

  const archetype = (staffProfile as any)?.roles?.archetype_code ?? null;
  const roleType: RoleType = getRoleTypeFromArchetype(archetype, staffProfile?.role_id);

  if (!domainSlug || !domainName) {
    return <Navigate to="/my-role" replace />;
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

  const list = data.competencies.filter((c) => c.domainName === domainName);
  const moveCount = list.reduce((sum, c) => sum + c.proMoves.length, 0);
  const domainContent = ROLE_CONTENT[roleType]?.[domainName] ?? null;
  const ink = getDomainInk(domainName);
  const colorVar = getDomainColorVarRaw(domainName);

  const breadcrumbItems: ExploreBreadcrumbItem[] = [
    { label: 'Explore', to: '/my-role' },
    { label: domainName },
  ];

  return (
    <div className="space-y-4">
      <BackPill label="Explore" to="/my-role" />
      <ExploreBreadcrumb items={breadcrumbItems} domainName={domainName} />

      {/* Hero — traveling domain color starts here. */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 border"
        style={{
          borderColor: `hsl(${colorVar} / 0.3)`,
          background: `radial-gradient(140% 120% at 0% 0%, ${getDomainPastelVar(domainName)} 0%, hsl(var(--card)) 70%)`,
        }}
      >
        <span
          className="text-2xs font-extrabold uppercase tracking-widest rounded-full px-2.5 py-1 inline-block"
          style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: ink }}
        >
          Domain
        </span>
        <h1 className="font-serif text-[22px] font-semibold mt-2.5" style={{ color: ink }}>
          {domainName}
        </h1>
        {domainContent?.valueProp && (
          <p className="text-[14px] leading-relaxed mt-2 max-w-[92%] text-muted-foreground">
            {domainContent.valueProp}
          </p>
        )}
        <p className="text-xs font-bold mt-3" style={{ color: ink }}>
          {list.length} competenc{list.length === 1 ? 'y' : 'ies'} · {moveCount} Pro Move{moveCount === 1 ? '' : 's'}
        </p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Areas to explore
        </h2>
        <div className="space-y-2">
          {list.map((c: AtlasCompetency) => {
            const actionIds = c.proMoves.map((m) => m.action_id);
            const dotCount = Math.min(actionIds.length, MAX_DOTS);
            const seen = countFor(actionIds);
            return (
              <button
                key={c.competency_id}
                type="button"
                onClick={() => navigate(`/my-role/area/${c.competency_id}`)}
                className="w-full text-left rounded-2xl border border-border bg-card p-3.5 flex items-stretch gap-3 active:scale-[0.99] transition-transform"
              >
                <span
                  className="w-1.5 rounded-full flex-none"
                  style={{ backgroundColor: getDomainColorVar(domainName) }}
                />
                <span className="flex-1 min-w-0">
                  {c.subtitle && (
                    <span className="block text-2xs font-bold uppercase tracking-wide" style={{ color: ink }}>
                      {c.subtitle}
                    </span>
                  )}
                  <span className="block text-[15px] font-semibold leading-snug mt-0.5">{c.title}</span>
                  <span className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {c.proMoves.length} Pro Move{c.proMoves.length === 1 ? '' : 's'}
                    </span>
                    {dotCount > 0 && (
                      <span className="inline-flex items-center gap-[3px]" title={`${seen} opened`}>
                        {Array.from({ length: dotCount }).map((_, i) => (
                          <span
                            key={i}
                            className="h-[5px] w-[5px] rounded-full"
                            style={{
                              backgroundColor: i < seen ? getDomainColorVar(domainName) : 'hsl(var(--border))',
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground self-center flex-none" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
