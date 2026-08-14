// Shared coach-level bucketing for the Craft Atlas (overview + area page).
// Thresholds match the existing ones in src/pages/my-role/DomainDetail.tsx
// (getAverageBadge) and src/components/my-role/CompetencyAccordion.tsx
// (getScoreBadge): observer score >= 3.5 -> Mastery, >= 2.5 -> Proficient,
// otherwise Building; null -> unscored.
export type ScoreLevel = 'Mastery' | 'Proficient' | 'Building';

export const SCORE_LEVEL_BUCKET: Record<ScoreLevel, 2 | 3 | 4> = {
  Building: 2,
  Proficient: 3,
  Mastery: 4,
};

export function levelForScore(score: number | null): ScoreLevel | null {
  if (score == null) return null;
  if (score >= 3.5) return 'Mastery';
  if (score >= 2.5) return 'Proficient';
  return 'Building';
}
