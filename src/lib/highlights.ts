export type WeekStatus = 'grey' | 'yellow' | 'green';

export function computeWeekStatus(rows: { confidence_score: number | null; performance_score: number | null }[]): WeekStatus {
  const total = rows.length;
  if (total === 0) return 'grey';
  const confCount = rows.filter(r => r.confidence_score !== null).length;
  const perfCount = rows.filter(r => r.performance_score !== null).length;

  if (confCount === 0) return 'grey';
  if (perfCount === total) return 'green';
  if (confCount === total && perfCount < total) return 'yellow';
  // Partial confidence or mixed state → treat as grey for strictness
  return 'grey';
}

export function computeRowHighlight(confidence: number | null, performance: number | null) {
  let tintClass = '';
  const tags: string[] = [];

  const hasConf = confidence !== null && confidence !== undefined;
  const hasPerf = performance !== null && performance !== undefined;

  const lowConfidence = hasConf && (confidence as number) <= 2;
  const beatConfidence = hasConf && hasPerf && (performance as number) - (confidence as number) >= 1;

  if (beatConfidence) {
    tintClass = 'bg-teal-50';
    tags.push('Beat confidence');
    if (lowConfidence) tags.push('Low confidence');
  } else if (lowConfidence) {
    tintClass = 'bg-orange-50';
    tags.push('Low confidence');
  }

  return { tintClass, tags };
}
