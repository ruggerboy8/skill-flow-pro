
# Batch Transcript + Insights Processor

## Overview

Add a batch processing tool to the Delivery tab that handles **two stages**:
1. **Transcription**: Evaluations with audio but no transcript
2. **Insight Extraction**: Evaluations with transcript but no insights

---

## UI Design

A collapsible section at the top of the Delivery tab:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 🎤 Missing Transcripts & Insights                               [▼] │
├─────────────────────────────────────────────────────────────────────┤
│ [Scan]  [Process All]                                               │
│                                                                      │
│ Found: 5 missing transcripts, 3 missing insights                    │
│                                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Staff         │ Location │ Audio Size │ Issue      │ Status    │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ John Smith    │ Austin   │ 12.4 MB    │ No Trans.  │ ✓ Done    │ │
│ │ Jane Doe      │ Dallas   │ 28.1 MB    │ No Trans.  │ ⚠ Skipped │ │
│ │ Mike Johnson  │ Houston  │ —          │ No Insight │ Processing│ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Processing Flow

```text
For each evaluation needing work:

1. If has audio_recording_path but no summary_raw_transcript:
   a. Download audio from storage
   b. If size > 25MB → Skip ("File too large")
   c. Send to transcribe-audio edge function
   d. Save transcript to summary_raw_transcript
   e. Continue to step 2

2. If has summary_raw_transcript but no extracted_insights:
   a. Send transcript to extract-insights edge function (source: 'observation')
   b. Save insights to extracted_insights.observer
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/components/admin/eval-results-v2/BatchTranscriptProcessor.tsx` | **New** - Full batch processing component |
| `src/components/admin/eval-results-v2/DeliveryTab.tsx` | Add BatchTranscriptProcessor at top of tab |

---

## Technical Details

### Component State

```typescript
interface PendingEval {
  id: string;
  staffName: string;
  locationName: string;
  audioPath: string | null;
  audioSize: number | null;
  issue: 'no_transcript' | 'no_insights';
  status: 'pending' | 'processing' | 'success' | 'skipped' | 'error';
  message?: string;
}
```

### Scan Query

```sql
SELECT id, staff_id, audio_recording_path, summary_raw_transcript, 
       extracted_insights, location_id
FROM evaluations 
WHERE (audio_recording_path IS NOT NULL AND summary_raw_transcript IS NULL)
   OR (summary_raw_transcript IS NOT NULL AND extracted_insights IS NULL)
```

### Processing Logic

```typescript
async function processOne(eval: PendingEval) {
  // Stage 1: Transcription (if needed)
  if (eval.issue === 'no_transcript' && eval.audioPath) {
    const { data: audioBlob } = await supabase.storage
      .from('evaluation-audio')
      .download(eval.audioPath);
    
    if (audioBlob.size > 25 * 1024 * 1024) {
      return { status: 'skipped', message: 'Audio file too large (>25MB)' };
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob);
    const { data: transcriptResult } = await supabase.functions
      .invoke('transcribe-audio', { body: formData });
    
    await supabase.from('evaluations')
      .update({ summary_raw_transcript: transcriptResult.transcript })
      .eq('id', eval.id);
    
    // Update local eval with transcript for stage 2
    eval.transcript = transcriptResult.transcript;
  }
  
  // Stage 2: Insight Extraction
  const transcript = eval.transcript || eval.existingTranscript;
  const { data: insightsResult } = await supabase.functions
    .invoke('extract-insights', { 
      body: { transcript, staffName: eval.staffName, source: 'observation' }
    });
  
  const insights = {
    observer: insightsResult.insights
  };
  
  await supabase.from('evaluations')
    .update({ extracted_insights: insights })
    .eq('id', eval.id);
  
  return { status: 'success' };
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Audio > 25MB | Skip with message "File too large" |
| Transcription fails | Mark error, continue to next |
| Insight extraction fails | Mark error, continue to next |
| Empty transcript returned | Mark error |
| User navigates away | Processing stops (no background) |
| Already has insights but missing observer key | Check for observer specifically |

---

## Summary

This batch processor will:
- Scan for evaluations needing transcription OR insight extraction
- Process them sequentially with progress feedback
- Skip files over 25MB (Whisper limit)
- Run both transcription and insight extraction in one pass when both are missing
- Display clear status for each evaluation
