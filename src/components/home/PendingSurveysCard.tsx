import { useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePendingSurveys } from '@/hooks/usePendingSurveys';

/**
 * Persistent banner shown app-wide while the current staff member has an
 * unanswered, open survey. Intentionally not dismissible — it stays until the
 * survey is completed so the system "insists" on a response.
 */
export function PendingSurveysCard() {
  const navigate = useNavigate();
  const { data: pending } = usePendingSurveys();

  if (!pending || pending.length === 0) return null;

  // Surface one at a time; the next appears after this one is completed.
  const next = pending[0];
  const more = pending.length - 1;

  return (
    <div className="rounded-lg border border-[hsl(var(--win-growth-border))] bg-[hsl(var(--win-growth-bg))] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--win-growth))]/15">
          <ClipboardList className="h-5 w-5 text-[hsl(var(--win-growth))]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">A survey needs your response</p>
          <p className="truncate text-sm text-muted-foreground">
            {next.survey.title}
            {more > 0 && <span className="ml-1 text-2xs">(+{more} more)</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate(`/survey/${next.survey.id}`)}>
          Take it <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
