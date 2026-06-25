import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Lock, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSurveyList } from '@/hooks/useSurveys';
import { deriveSurveyState, surveyStateBadgeClass } from '@/lib/surveyStatus';
import { cn } from '@/lib/utils';

export function AdminSurveysTab() {
  const navigate = useNavigate();
  const { data: surveys, isLoading } = useSurveyList();

  const open = (id: string, isDraft: boolean) =>
    navigate(isDraft ? `/admin/surveys/${id}/edit` : `/admin/surveys/${id}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create and send brief surveys or polls to Alcan staff.
        </p>
        <Button onClick={() => navigate('/admin/surveys/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New survey
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !surveys || surveys.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No surveys yet"
          description="Create your first survey to gather feedback from staff."
        />
      ) : (
        <div className="space-y-3">
          {surveys.map((s) => {
            const state = deriveSurveyState(s);
            const isDraft = state === 'Draft';
            const pct = s.assigned_count
              ? Math.round((s.completed_count / s.assigned_count) * 100)
              : 0;
            return (
              <Card
                key={s.id}
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => open(s.id, isDraft)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.title}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
                          surveyStateBadgeClass(state),
                        )}
                      >
                        {state}
                      </span>
                      {s.is_anonymous && (
                        <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                          <EyeOff className="h-3 w-3" /> Anonymous
                        </span>
                      )}
                      {!isDraft && (
                        <Lock className="h-3 w-3 text-muted-foreground" aria-label="Questions locked" />
                      )}
                    </div>
                    {s.description && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{s.description}</p>
                    )}
                  </div>

                  {!isDraft && (
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">{pct}%</div>
                      <div className="text-2xs text-muted-foreground">
                        {s.completed_count}/{s.assigned_count} done
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
