import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Send, Save, Loader2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import { getAlcanActiveLocationIds } from '@/lib/alcanScope';
import { useSurvey, useSurveyMutations, type DraftQuestion } from '@/hooks/useSurveys';
import { QuestionEditor } from '@/components/admin/surveys/QuestionEditor';
import { TargetingPicker } from '@/components/admin/surveys/TargetingPicker';

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

const emptyQuestion = (): DraftQuestion => ({
  type: 'single_choice',
  prompt: '',
  required: true,
  config: { choices: ['', ''] },
});

export default function SurveyBuilderPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { canAccess, isLoading: accessLoading } = useAskAlcanAccess();
  const { data: existing, isLoading: loadingSurvey } = useSurvey(isEdit ? id : undefined);
  const { createDraft, saveDraft, publish } = useSurveyMutations();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from an existing draft once.
  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      if (existing.survey.status !== 'draft') {
        // Published surveys are locked — bounce to results.
        navigate(`/admin/surveys/${id}`, { replace: true });
        return;
      }
      setTitle(existing.survey.title);
      setDescription(existing.survey.description ?? '');
      setIsAnonymous(existing.survey.is_anonymous);
      setOpensAt(isoToLocalInput(existing.survey.opens_at));
      setClosesAt(isoToLocalInput(existing.survey.closes_at));
      setLocationIds(existing.survey.target_location_ids ?? []);
      setRoleIds(existing.survey.target_role_ids ?? []);
      setQuestions(
        existing.questions.length
          ? existing.questions.map((q) => ({
              id: q.id,
              type: q.type,
              prompt: q.prompt,
              required: q.required,
              config: q.config,
            }))
          : [emptyQuestion()],
      );
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated, id, navigate]);

  // Estimated recipients for the current targeting.
  const { data: recipientEstimate } = useQuery({
    queryKey: ['survey-recipient-estimate', [...locationIds].sort().join(','), [...roleIds].sort().join(',')],
    queryFn: async (): Promise<number> => {
      const allLocIds = await getAlcanActiveLocationIds();
      const scopeLocIds = locationIds.length ? locationIds : allLocIds;
      if (!scopeLocIds.length) return 0;
      let q = supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .in('primary_location_id', scopeLocIds)
        .eq('is_paused', false);
      if (roleIds.length) q = q.in('role_id', roleIds);
      const { count } = await q;
      return count ?? 0;
    },
    enabled: canAccess,
  });

  const draftInput = useMemo(
    () => ({
      title: title.trim(),
      description: description.trim() || null,
      is_anonymous: isAnonymous,
      opens_at: localInputToIso(opensAt),
      closes_at: localInputToIso(closesAt),
      target_location_ids: locationIds,
      target_role_ids: roleIds,
      questions: questions.map((q) => ({ ...q, prompt: q.prompt.trim() })),
    }),
    [title, description, isAnonymous, opensAt, closesAt, locationIds, roleIds, questions],
  );

  if (accessLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  if (!canAccess) {
    navigate('/');
    return null;
  }
  if (isEdit && loadingSurvey) {
    return <div className="p-6 max-w-3xl mx-auto"><Skeleton className="h-96 w-full" /></div>;
  }

  const updateQuestion = (i: number, q: DraftQuestion) =>
    setQuestions((prev) => prev.map((p, pi) => (pi === i ? q : p)));
  const removeQuestion = (i: number) =>
    setQuestions((prev) => prev.filter((_, pi) => pi !== i));
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Validation shared by save + publish.
  function validate(forPublish: boolean): string | null {
    if (!draftInput.title) return 'Give the survey a title.';
    if (draftInput.questions.length === 0) return 'Add at least one question.';
    for (const [i, q] of draftInput.questions.entries()) {
      if (!q.prompt) return `Question ${i + 1} needs a prompt.`;
      if (q.type === 'single_choice' || q.type === 'multi_choice') {
        const valid = (q.config.choices ?? []).map((c) => c.trim()).filter(Boolean);
        if (valid.length < 2) return `Question ${i + 1} needs at least two options.`;
      }
      if (q.type === 'rating') {
        const { min, max } = q.config;
        if (min == null || max == null || max <= min) return `Question ${i + 1} has an invalid rating range.`;
      }
    }
    if (forPublish && draftInput.opens_at && draftInput.closes_at &&
        new Date(draftInput.closes_at) <= new Date(draftInput.opens_at)) {
      return 'Close date must be after the open date.';
    }
    return null;
  }

  async function persistDraft(): Promise<string | null> {
    if (isEdit && id) {
      await saveDraft.mutateAsync({ surveyId: id, input: draftInput });
      return id;
    }
    return await createDraft.mutateAsync(draftInput);
  }

  const handleSaveDraft = async () => {
    const err = validate(false);
    if (err) return toast.error(err);
    try {
      const sid = await persistDraft();
      toast.success('Draft saved');
      if (!isEdit && sid) navigate(`/admin/surveys/${sid}/edit`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save');
    }
  };

  const handlePublish = async () => {
    const err = validate(true);
    if (err) return toast.error(err);
    try {
      const sid = await persistDraft();
      if (!sid) throw new Error('Save failed');
      await publish.mutateAsync(sid);
      toast.success('Survey published');
      navigate(`/admin/surveys/${sid}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not publish');
    }
  };

  const busy = createDraft.isPending || saveDraft.isPending || publish.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to surveys" onClick={() => navigate('/admin?tab=surveys')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit survey' : 'New survey'}</h1>
      </div>

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 eNPS Pulse" />
          </div>
          <div>
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short note shown to staff." />
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor="anon" className="text-sm font-medium">Anonymous responses</Label>
              <p className="text-2xs text-muted-foreground">
                Answers won't be linked to staff. Completion is still tracked so you can see who's finished.
              </p>
            </div>
            <Switch id="anon" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id ?? i}
              question={q}
              index={i}
              total={questions.length}
              onChange={(nq) => updateQuestion(i, nq)}
              onRemove={() => removeQuestion(i)}
              onMove={(dir) => moveQuestion(i, dir)}
            />
          ))}
          <Button variant="outline" onClick={() => setQuestions((p) => [...p, emptyQuestion()])}>
            <Plus className="h-4 w-4 mr-2" /> Add question
          </Button>
        </CardContent>
      </Card>

      {/* Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who gets it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TargetingPicker
            locationIds={locationIds}
            roleIds={roleIds}
            onChange={({ locationIds: l, roleIds: r }) => {
              setLocationIds(l);
              setRoleIds(r);
            }}
          />
          <p className="text-sm text-muted-foreground">
            Estimated recipients: <span className="font-semibold text-foreground">{recipientEstimate ?? '…'}</span>
          </p>
          {recipientEstimate === 0 && (
            <p className="text-2xs text-destructive">
              No active staff match this targeting. Adjust the filters before publishing.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="opens">Opens (optional)</Label>
            <Input id="opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            <p className="mt-1 text-2xs text-muted-foreground">Leave blank to open immediately on publish.</p>
          </div>
          <div>
            <Label htmlFor="closes">Closes (optional)</Label>
            <Input id="closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            <p className="mt-1 text-2xs text-muted-foreground">Leave blank to keep open until you close it.</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={handleSaveDraft} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save draft
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={busy || recipientEstimate === 0}>
              <Send className="h-4 w-4 mr-2" /> Publish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish this survey?</AlertDialogTitle>
              <AlertDialogDescription>
                It will be assigned to about{' '}
                {recipientEstimate === undefined ? 'a number of' : recipientEstimate} staff and questions will lock.
                You can close it early or duplicate it later, but you can't edit the questions once it's live.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePublish}>Publish</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
