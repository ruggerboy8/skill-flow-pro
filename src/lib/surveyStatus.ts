import type { SurveyRow } from '@/integrations/supabase/surveyTypes';

export type SurveyDisplayState = 'Draft' | 'Scheduled' | 'Open' | 'Closed';

/** Derive the user-facing state from status + the open/close window. */
export function deriveSurveyState(
  s: Pick<SurveyRow, 'status' | 'opens_at' | 'closes_at'>,
): SurveyDisplayState {
  if (s.status === 'draft') return 'Draft';
  if (s.status === 'closed') return 'Closed';
  const now = Date.now();
  if (s.closes_at && new Date(s.closes_at).getTime() < now) return 'Closed';
  if (s.opens_at && new Date(s.opens_at).getTime() > now) return 'Scheduled';
  return 'Open';
}

/** Tailwind classes for a state badge (uses status CSS tokens from the design system). */
export function surveyStateBadgeClass(state: SurveyDisplayState): string {
  switch (state) {
    case 'Open':
      return 'bg-[hsl(var(--status-complete-bg))] text-[hsl(var(--status-complete))]';
    case 'Scheduled':
      return 'bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending))]';
    case 'Closed':
      return 'bg-muted text-muted-foreground';
    case 'Draft':
    default:
      return 'bg-[hsl(var(--status-late-bg))] text-[hsl(var(--status-late))]';
  }
}
