import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Copy, XCircle, EyeOff, ShieldAlert, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import { useSurveyResults } from '@/hooks/useSurveyResults';
import { useSurveyMutations } from '@/hooks/useSurveys';
import { deriveSurveyState, surveyStateBadgeClass } from '@/lib/surveyStatus';
import {
  summarizeQuestion, buildResponseCsvRows, SURVEY_MIN_ANON_N,
} from '@/lib/surveyResults';
import { downloadCSV } from '@/lib/csvExport';
import { cn } from '@/lib/utils';

export default function SurveyResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canAccess, isLoading: accessLoading } = useAskAlcanAccess();
  const { data, isLoading } = useSurveyResults(id);
  const { close, duplicate } = useSurveyMutations();

  if (accessLoading || isLoading) {
    return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-96 w-full" /></div>;
  }
  if (!canAccess) {
    navigate('/');
    return null;
  }
  if (!data) {
    return <div className="mx-auto max-w-3xl p-6 text-muted-foreground">Survey not found.</div>;
  }

  const { survey, questions, assignedCount, completedCount, responses, answers, staffNames } = data;
  const state = deriveSurveyState(survey);
  const pct = assignedCount ? Math.round((completedCount / assignedCount) * 100) : 0;
  const responseCount = responses.length;
  const suppressed = survey.is_anonymous && responseCount < SURVEY_MIN_ANON_N;

  const handleExport = () => {
    const rows = buildResponseCsvRows({
      isAnonymous: survey.is_anonymous,
      questions,
      responses,
      answers,
      staffNames,
    });
    if (!rows.length) return toast.info('No responses to export yet.');
    const slug = survey.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    downloadCSV(rows, `survey_${slug || 'export'}`);
    toast.success('CSV downloaded');
  };

  const handleClose = async () => {
    try {
      await close.mutateAsync(survey.id);
      toast.success('Survey closed');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not close');
    }
  };

  const handleDuplicate = async () => {
    try {
      const newId = await duplicate.mutateAsync(survey.id);
      toast.success('Duplicated to a new draft');
      navigate(`/admin/surveys/${newId}/edit`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin?tab=surveys')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{survey.title}</h1>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
                surveyStateBadgeClass(state),
              )}
            >
              {state}
            </span>
            {survey.is_anonymous && (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                <EyeOff className="h-3 w-3" /> Anonymous
              </span>
            )}
          </div>
          {survey.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{survey.description}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" /> Download CSV
        </Button>
        <Button variant="outline" onClick={handleDuplicate} disabled={duplicate.isPending}>
          {duplicate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
          Duplicate
        </Button>
        {state === 'Open' || state === 'Scheduled' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive" disabled={close.isPending}>
                <XCircle className="h-4 w-4 mr-2" /> Close now
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close this survey?</AlertDialogTitle>
                <AlertDialogDescription>
                  Staff will no longer be able to respond. This can't be undone (you can duplicate it to re-run).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClose}>Close survey</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      {/* Completion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold">{pct}%</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} of {assignedCount} completed
            </span>
          </div>
          <Progress value={pct} />
        </CardContent>
      </Card>

      {/* Small-N guard */}
      {suppressed && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            This survey is anonymous and has only {responseCount} response
            {responseCount === 1 ? '' : 's'}. Per-question results are hidden until at least{' '}
            {SURVEY_MIN_ANON_N} people respond, to protect anonymity.
          </AlertDescription>
        </Alert>
      )}

      {/* Per-question summaries */}
      {!suppressed && (
        <div className="space-y-4">
          {questions.map((q, i) => {
            const s = summarizeQuestion(q, answers);
            return (
              <Card key={q.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    <span className="text-muted-foreground">Q{i + 1}. </span>
                    {q.prompt}
                  </CardTitle>
                  <p className="text-2xs text-muted-foreground">{s.answered} answered</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Choice */}
                  {s.choices &&
                    s.choices.map((c) => (
                      <div key={c.option} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="truncate">{c.option || <em className="text-muted-foreground">(blank)</em>}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {c.count} · {c.pct}%
                          </span>
                        </div>
                        <Progress value={c.pct} className="h-1.5" />
                      </div>
                    ))}

                  {/* Rating */}
                  {q.type === 'rating' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-2xl font-semibold">
                            {s.average != null ? s.average.toFixed(1) : '—'}
                          </div>
                          <div className="text-2xs text-muted-foreground">average</div>
                        </div>
                        {s.nps != null && (
                          <div>
                            <div className="text-2xl font-semibold">{s.nps}</div>
                            <div className="text-2xs text-muted-foreground">NPS</div>
                          </div>
                        )}
                      </div>
                      {s.distribution && s.distribution.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {s.distribution.map((d) => (
                            <span
                              key={d.value}
                              className="rounded bg-muted px-2 py-0.5 text-2xs tabular-nums"
                            >
                              {d.value}: {d.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Free text */}
                  {s.texts && (
                    s.texts.length ? (
                      <ul className="space-y-1.5">
                        {s.texts.map((t, ti) => (
                          <li key={ti} className="rounded-md bg-muted/50 p-2 text-sm">
                            {t}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No responses yet.</p>
                    )
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
