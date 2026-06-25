import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSurveyForTaking, useSubmitSurvey } from '@/hooks/usePendingSurveys';
import type {
  SurveyQuestionRow,
  SurveyAnswerValue,
  SurveyAnswerInput,
} from '@/integrations/supabase/surveyTypes';

type AnswerMap = Record<string, SurveyAnswerValue>;

function isAnswered(q: SurveyQuestionRow, v: SurveyAnswerValue): boolean {
  if (q.type === 'multi_choice') return Array.isArray(v) && v.length > 0;
  if (q.type === 'rating') return typeof v === 'number' && Number.isFinite(v);
  return typeof v === 'string' && v.trim().length > 0;
}

export default function SurveyTakePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useSurveyForTaking(id);
  const submit = useSubmitSurvey();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  if (isLoading) {
    return <div className="mx-auto max-w-2xl p-6"><Skeleton className="h-96 w-full" /></div>;
  }
  if (!data) {
    return <div className="mx-auto max-w-2xl p-6 text-muted-foreground">Survey not available.</div>;
  }

  const { survey, questions, alreadyCompleted } = data;

  if (alreadyCompleted) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-complete))]" />
            <p className="font-medium">You've already completed this survey.</p>
            <p className="text-sm text-muted-foreground">Thanks for your response.</p>
            <Button className="mt-2" onClick={() => navigate('/')}>Back to home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const setAnswer = (qid: string, v: SurveyAnswerValue) =>
    setAnswers((prev) => ({ ...prev, [qid]: v }));

  const toggleMulti = (qid: string, option: string) =>
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      return {
        ...prev,
        [qid]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option],
      };
    });

  const firstMissingRequired = questions.find(
    (q) => q.required && !isAnswered(q, answers[q.id]),
  );

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (firstMissingRequired) {
      toast.error('Please answer the highlighted questions.');
      const el = document.getElementById(`q-${firstMissingRequired.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
      return;
    }
    const payload: SurveyAnswerInput[] = questions
      .filter((q) => isAnswered(q, answers[q.id]))
      .map((q) => ({ question_id: q.id, value: answers[q.id] }));
    try {
      await submit.mutateAsync({ surveyId: survey.id, answers: payload });
      toast.success('Thanks! Your response was recorded.');
      navigate('/');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not submit');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to home" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">{survey.title}</h1>
      </div>

      {survey.description && <p className="text-sm text-muted-foreground">{survey.description}</p>}

      {survey.is_anonymous && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-2xs text-muted-foreground">
          <EyeOff className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Anonymous. Your answers aren't linked to your name. We can see that you responded, but not what you said.
          </span>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => {
          const val = answers[q.id];
          const missing = submitAttempted && q.required && !isAnswered(q, val);
          return (
            <Card key={q.id} id={`q-${q.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  <span className="text-muted-foreground">Q{i + 1}. </span>
                  {q.prompt}
                  {q.required && <span className="ml-1 text-destructive">*</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {q.type === 'single_choice' && (
                  <RadioGroup
                    value={typeof val === 'string' ? val : ''}
                    onValueChange={(v) => setAnswer(q.id, v)}
                    className="space-y-2"
                  >
                    {(q.config.choices ?? []).map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <RadioGroupItem id={`${q.id}-${ci}`} value={c} />
                        <Label htmlFor={`${q.id}-${ci}`} className="cursor-pointer font-normal">{c}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {q.type === 'multi_choice' && (
                  <div className="space-y-2">
                    {(q.config.choices ?? []).map((c, ci) => {
                      const checked = Array.isArray(val) && val.includes(c);
                      return (
                        <div key={ci} className="flex items-center gap-2">
                          <Checkbox
                            id={`${q.id}-${ci}`}
                            checked={checked}
                            onCheckedChange={() => toggleMulti(q.id, c)}
                          />
                          <Label htmlFor={`${q.id}-${ci}`} className="cursor-pointer font-normal">{c}</Label>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === 'free_text' && (
                  <Textarea
                    value={typeof val === 'string' ? val : ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Type your answer…"
                  />
                )}

                {q.type === 'rating' && <RatingControl q={q} value={val} onChange={(v) => setAnswer(q.id, v)} />}

                {missing && (
                  <p className="mt-2 text-2xs text-destructive" role="alert">
                    This question is required.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button onClick={handleSubmit} disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit
        </Button>
      </div>
    </div>
  );
}

function RatingControl({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestionRow;
  value: SurveyAnswerValue;
  onChange: (v: number) => void;
}) {
  const min = q.config.min ?? 0;
  const max = q.config.max ?? 10;
  const scale: number[] = [];
  for (let n = min; n <= max; n++) scale.push(n);

  const labelFor = (n: number) => {
    if (n === min && q.config.minLabel) return `${n}, ${q.config.minLabel}`;
    if (n === max && q.config.maxLabel) return `${n}, ${q.config.maxLabel}`;
    return String(n);
  };

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={q.prompt} className="flex flex-wrap gap-1.5">
        {scale.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={labelFor(n)}
            onClick={() => onChange(n)}
            className={cn(
              'h-9 w-9 rounded-md border text-sm font-medium tabular-nums transition-colors',
              value === n
                ? 'border-primary bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                : 'border-input hover:bg-muted',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(q.config.minLabel || q.config.maxLabel) && (
        <div className="flex justify-between text-2xs text-muted-foreground">
          <span>{q.config.minLabel}</span>
          <span>{q.config.maxLabel}</span>
        </div>
      )}
    </div>
  );
}
