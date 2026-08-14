import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useCraftAtlas, type AtlasCompetency } from '@/hooks/useCraftAtlas';
import { DOMAIN_ORDER } from '@/lib/content/roleDefinitions';
import { getDomainColorVar, getDomainPastelVar } from '@/lib/domainColors';
import { levelForScore, SCORE_LEVEL_BUCKET, type ScoreLevel } from '@/lib/scoreLevel';

function LevelPill({ score }: { score: number | null }) {
  const level = levelForScore(score);
  if (!level) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold bg-muted text-muted-foreground whitespace-nowrap">
        Not yet rated
      </span>
    );
  }
  const bucket = SCORE_LEVEL_BUCKET[level];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold whitespace-nowrap"
      style={{ backgroundColor: `hsl(var(--score-${bucket}-bg))`, color: `hsl(var(--score-${bucket}-ink))` }}
    >
      {level}
    </span>
  );
}

/**
 * Atlas overview — the Explore tab's landing screen (Concept B, screen 1).
 * Mobile-shell only; the branch lives in RoleRadar.tsx so desktop's route
 * table and RoleRadar rendering stay untouched. See
 * docs/features/explore-my-role-build-instructions.md section B.
 */
export default function CraftAtlasOverview() {
  const navigate = useNavigate();
  const { data, isLoading } = useCraftAtlas();

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full max-w-xs" />
        </div>
        <Skeleton className="h-12 rounded-2xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  const n = data.competencies.length;
  const hasEvaluation = data.periodLabel !== null;

  const levelCounts: Record<ScoreLevel, number> = { Mastery: 0, Proficient: 0, Building: 0 };
  for (const c of data.competencies) {
    const level = levelForScore(c.observerScore);
    if (level) levelCounts[level]++;
  }
  const snapshotPills = (Object.keys(levelCounts) as ScoreLevel[])
    .filter((label) => levelCounts[label] > 0)
    // Mastery, Proficient, Building — matches the level hierarchy top to bottom.
    .sort((a, b) => SCORE_LEVEL_BUCKET[b] - SCORE_LEVEL_BUCKET[a]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Explore</p>
        <h1 className="text-[22px] font-bold tracking-tight -mt-1">My Role</h1>
        <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
          {n} skill areas, one map. The color is the domain. The badge is you.
        </p>
      </div>

      {/* Snapshot strip. TODO(build-review): the spec only names two states
          here (pills when levels exist, the fallback line when no
          evaluation exists at all) — an evaluation that exists but scores
          none of this person's merged competencies falls through to
          neither and renders nothing, which matches "no empty chrome" but
          hasn't been asked for explicitly. Not expected in practice since
          an evaluation normally covers every domain. */}
      {hasEvaluation ? (
        snapshotPills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
            {snapshotPills.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                style={{
                  backgroundColor: `hsl(var(--score-${SCORE_LEVEL_BUCKET[label]}-bg))`,
                  color: `hsl(var(--score-${SCORE_LEVEL_BUCKET[label]}-ink))`,
                }}
              >
                {label} ×{levelCounts[label]}
              </span>
            ))}
          </div>
        )
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Your coach levels appear here after your first evaluation.
        </p>
      )}

      {/* Domain bands */}
      <div className="space-y-6">
        {DOMAIN_ORDER.map((domain) => {
          const list = data.competencies.filter((c) => c.domainName === domain);
          if (list.length === 0) return null;
          const moveCount = list.reduce((sum, c) => sum + c.proMoves.length, 0);

          return (
            <div key={domain}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="h-2.5 w-2.5 flex-none"
                  style={{ backgroundColor: getDomainColorVar(domain), borderRadius: 3 }}
                />
                <h2 className="text-[13px] font-extrabold tracking-wide">{domain}</h2>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {list.length} area{list.length === 1 ? '' : 's'} · {moveCount} move{moveCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {list.map((c: AtlasCompetency) => (
                  <button
                    key={c.competency_id}
                    type="button"
                    onClick={() => navigate(`/my-role/area/${c.competency_id}`)}
                    className="text-left rounded-2xl p-3 min-h-[74px] flex flex-col justify-between active:scale-[0.97] transition-transform"
                    style={{ backgroundColor: getDomainPastelVar(domain) }}
                  >
                    <span className="text-[13.5px] font-semibold leading-snug text-foreground">{c.title}</span>
                    <span className="flex items-center justify-between gap-2 mt-2">
                      <LevelPill score={c.observerScore} />
                      <span className="text-2xs font-semibold text-muted-foreground whitespace-nowrap">
                        {c.proMoves.length} move{c.proMoves.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
