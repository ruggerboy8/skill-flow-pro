import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceLocation } from '@/hooks/useWorkspaceLocations';
import type { NewIssueInput } from '@/hooks/useCoachingWorkspace';
import type { LeadMeetingRow, NewLeadMeetingInput, UpdateLeadMeetingInput } from '@/types/leadMeetings';
import { deriveMeetingWeekStart, isTranscriptLongEnough } from '@/lib/leadMeetingsAndFocus';
import { maskDateInput, parseTypedDate, formatDateForDisplay } from '@/lib/dateInputMask';
import { IssueCandidateExtractor } from './IssueCandidateExtractor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Sparkles, CalendarDays } from 'lucide-react';

// LRM-1's "Record meeting" / view-meeting dialog. One pasted transcript feeds
// three outputs: an editable internal summary (this dialog, via the
// lead-meeting-summary edge function), the existing candidate-issue keep/drop
// flow (IssueCandidateExtractor, the same coaching-extract-issues code path
// TrainingWorkspace used to run from its own standalone Ingest dialog), and
// the stored raw transcript itself (for LRM-2's blast drafter).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'create' opens blank, defaulted to the displayed week. 'view' shows a saved meeting. */
  mode: 'create' | 'view';
  meeting?: LeadMeetingRow | null;
  /** Monday of the currently displayed week -- used to default the date field in create mode. */
  weekStart: string;
  locations: WorkspaceLocation[];
  onCreate: (input: NewLeadMeetingInput) => void;
  onUpdateSummary: (input: UpdateLeadMeetingInput) => void;
  onAddIssue: (input: NewIssueInput) => void;
  creating: boolean;
  updating: boolean;
}

export function RecordMeetingDialog({
  open, onOpenChange, mode, meeting, weekStart, locations, onCreate, onUpdateSummary, onAddIssue, creating, updating,
}: Props) {
  const [dateDisplay, setDateDisplay] = useState(formatDateForDisplay(weekStart));
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [generating, setGenerating] = useState(false);
  const [extractTrigger, setExtractTrigger] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (mode === 'view' && meeting) {
      setDateDisplay(formatDateForDisplay(meeting.meeting_date));
      setTranscript(meeting.raw_transcript ?? '');
      setSummary(meeting.internal_summary ?? '');
    } else {
      setDateDisplay(formatDateForDisplay(weekStart));
      setTranscript('');
      setSummary('');
    }
    setGenerating(false);
    setExtractTrigger(0);
  }, [open, mode, meeting, weekStart]);

  const parsedDate = parseTypedDate(dateDisplay);
  // QA fix: a typed date can legitimately fall in a different week than the
  // one the dialog was opened from (backfilling an old meeting, or a typo).
  // Show where it will land instead of blocking the save.
  const parsedWeekStart = parsedDate ? deriveMeetingWeekStart(parsedDate) : null;
  const landsInOtherWeek = parsedWeekStart != null && parsedWeekStart !== weekStart;
  const transcriptReady = isTranscriptLongEnough(transcript);

  const generate = async () => {
    if (!transcriptReady) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('lead-meeting-summary', { body: { transcript } });
      if (error) throw error;
      const s = (data as any)?.summary?.trim();
      if (s) setSummary(s);
      else toast({ title: 'No summary produced', description: 'Write one yourself below.' });
    } catch (e: any) {
      toast({ title: "Couldn't generate a summary", description: e?.message ?? 'Write one yourself below.', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
    // Run the candidate-issue extraction alongside the summary, independent
    // of whether the summary call itself succeeded.
    setExtractTrigger((n) => n + 1);
  };

  const save = () => {
    if (!parsedDate || !transcriptReady || !summary.trim()) return;
    onCreate({
      meetingDate: parsedDate,
      weekStartDate: deriveMeetingWeekStart(parsedDate),
      rawTranscript: transcript.trim(),
      internalSummary: summary.trim(),
    });
    onOpenChange(false);
  };

  const saveSummaryEdit = () => {
    if (!meeting || !summary.trim()) return;
    onUpdateSummary({ id: meeting.id, internalSummary: summary.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Record meeting' : 'Meeting'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/80">
              <CalendarDays className="h-4 w-4" />Date
            </label>
            {mode === 'create' ? (
              <Input
                value={dateDisplay}
                onChange={(e) => setDateDisplay(maskDateInput(e.target.value))}
                placeholder="MM/DD/YYYY"
                inputMode="numeric"
                className="max-w-[160px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{dateDisplay}</p>
            )}
            {mode === 'create' && dateDisplay.length === 10 && !parsedDate && (
              <p className="mt-1 text-xs text-destructive">That date doesn't look right.</p>
            )}
            {mode === 'create' && landsInOtherWeek && (
              <p className="mt-1 text-xs text-muted-foreground">
                This date is in the week of {formatDateForDisplay(parsedWeekStart)}, so the meeting will be recorded there.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">Transcript</label>
            {mode === 'create' ? (
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={7}
                placeholder="Paste the meeting transcript here…"
              />
            ) : (
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                {transcript || 'No transcript stored.'}
              </div>
            )}
          </div>

          {mode === 'create' && (
            <Button disabled={!transcriptReady || generating} onClick={generate}>
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : <><Sparkles className="mr-2 h-4 w-4" />Generate summary &amp; find issues</>}
            </Button>
          )}

          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">
              Internal summary <span className="font-normal normal-case tracking-normal text-muted-foreground">(private to you)</span>
            </label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              placeholder="What was discussed, decided, and clarified. Editable before and after saving."
            />
            {mode === 'view' && (
              <Button variant="outline" size="sm" className="mt-2" disabled={updating || !summary.trim()} onClick={saveSummaryEdit}>
                {updating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</> : 'Save summary'}
              </Button>
            )}
          </div>

          {mode === 'create' && (
            <IssueCandidateExtractor
              transcript={transcript}
              locations={locations}
              onAdd={onAddIssue}
              runTrigger={extractTrigger}
            />
          )}
        </div>

        {mode === 'create' && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!parsedDate || !transcriptReady || !summary.trim() || creating} onClick={save}>
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save meeting'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
