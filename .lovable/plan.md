

## Problem

The "Analyze & Extract Insights" button for the self-assessment (interview) tab is located **inside** the collapsible Interview Transcript card. Since the transcript defaults to collapsed, the coach has to manually expand it (click the chevron) just to find and click the analyze button. This breaks the natural workflow: **Record -> Transcribe -> Analyze**.

## Solution

Move the "Analyze & Extract Insights" button **outside and above** the collapsible transcript card, so it's always visible when a transcript exists. The transcript card remains collapsible for reviewing/editing, but the primary action button sits prominently in the workflow flow.

## Workflow After Change

```text
+----------------------------------+
| Recording Card                   |
| [audio player / transcribe btn]  |
+----------------------------------+
         |
         v
+----------------------------------+
| Transcription complete banner    |
+----------------------------------+
         |
         v
+----------------------------------+
| [ Analyze & Extract Insights ]   |  <-- Always visible when transcript exists
+----------------------------------+
         |
         v
+----------------------------------+
| > Interview Transcript (collapsed)|  <-- Expandable for review/edit
|   [rich text editor when open]   |
+----------------------------------+
```

## Technical Details

**File:** `src/pages/coach/EvaluationHub.tsx`

1. **Move the Analyze button block** (currently lines ~2411-2437 inside `CardContent` of the transcript card) to sit **between** the recording card and the transcript card -- right after the transcript-complete/analysis-complete banners and before the `{interviewTranscript && <Card>...}` block (around line 2370).

2. **Render condition**: Show the button when `interviewTranscript` exists and `!isReadOnly`. This is the same condition as today, just repositioned.

3. **Styling**: Wrap in a small card or a prominent standalone section with clear visual weight so coaches see it immediately as their next action.

4. **Keep transcript card clean**: The transcript card becomes purely for review/editing -- no action buttons inside it.

