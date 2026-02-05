

# Client-Side Audio Segmentation: Observer Notes + Interview Transcript

## Overview

Enable automatic chunking of large audio recordings at ~20MB boundaries, transcribe each chunk through Whisper, and concatenate the transcripts. This removes the need for any fallback service and works for **both** recording types.

---

## Current Architecture

| Component | Recording Type | Uses `useAudioRecording` Hook? |
|-----------|---------------|-------------------------------|
| `EvaluationHub.tsx` | Observer Notes | Yes - `useAudioRecording()` at line 134 |
| `EvaluationHub.tsx` | Interview | No - downloads from storage, sends to `transcribe-audio` |
| `InterviewRecorder.tsx` | Interview | No - manages own `MediaRecorder` internally |

### Key Insight
- **Observer Notes**: Recorded live in browser → blob sent to `transcribe-audio`
- **Interview**: Recorded externally or in-browser → uploaded to storage → downloaded and sent to `transcribe-audio`

The transcription bottleneck is the same for both: the `transcribe-audio` edge function receives files >25MB and fails.

---

## Risk Assessment (Coaches in Field)

| Change | Risk Level | Why Safe |
|--------|------------|----------|
| Enable segmentation for Observer Notes | **Low** | Only activates when recording exceeds 20MB; short recordings unchanged |
| Update `handleTranscribeInterview` to chunk blob | **Low** | Only affects files >25MB; smaller files follow existing path |
| No edge function changes | **None** | `transcribe-audio` continues to work exactly as before |

**Key Safety**: Recordings under 20MB continue through the existing single-file path. Only large files use the new segmented transcription.

---

## Implementation Plan

### Phase 1: Observer Notes Segmentation

**File**: `src/pages/coach/EvaluationHub.tsx`

1. **Enable segmentation in hook call** (line 134):
   ```typescript
   const { state: recordingState, controls: recordingControls } = useAudioRecording({
     enableSegmentation: true,
     onSegmentReady: handleObserverSegmentReady,
   });
   ```

2. **Add segment transcript tracking state**:
   ```typescript
   const [segmentTranscripts, setSegmentTranscripts] = useState<string[]>([]);
   ```

3. **Implement segment upload callback**:
   - When a segment is ready (every ~20MB), upload to `transcribe-audio`
   - Store transcript in array indexed by segment number
   - Show progress indicator

4. **Modify `handleTranscribeObservation`**:
   - Transcribe the final segment (remaining audio after recording stops)
   - Concatenate all segment transcripts in order
   - Continue with existing flow (format-transcript, save to DB)

### Phase 2: Interview Transcript Segmentation

**File**: `src/pages/coach/EvaluationHub.tsx`

The interview flow downloads a blob from storage, so we need to **chunk the blob before sending**.

1. **Create blob chunking helper**:
   ```typescript
   async function* chunkBlob(blob: Blob, chunkSize: number) {
     let offset = 0;
     let index = 0;
     while (offset < blob.size) {
       yield { 
         chunk: blob.slice(offset, offset + chunkSize), 
         index 
       };
       offset += chunkSize;
       index++;
     }
   }
   ```

2. **Modify `handleTranscribeInterview`** (lines 1045-1113):
   - Check if downloaded blob exceeds 20MB
   - If yes: chunk it, transcribe each chunk, concatenate transcripts
   - If no: use existing single-file path

3. **Update progress indicator**:
   - Show "Transcribing segment 1 of N..." for large files

### Phase 3: InterviewRecorder Component (Live Recording)

**File**: `src/components/coach/InterviewRecorder.tsx`

The `InterviewRecorder` manages its own `MediaRecorder` internally and doesn't use the shared hook.

1. **Add segmentation logic** to match `useAudioRecording`:
   - Track segment size in `ondataavailable`
   - When segment reaches 20MB, finalize and start new segment
   - Store segments for later transcription

2. **Wire up to parent's transcription flow**:
   - When `onTranscribe` is called, pass all segments
   - Parent handles multi-segment transcription

---

## Technical Flow

```text
OBSERVER NOTES (Live Recording):
┌─────────────────────────────────────────────────────────────┐
│  Recording in progress                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │ Chunk 1  │──▶│ Chunk 2  │──▶│ Chunk 3  │──▶ ...        │
│  │ (20MB)   │   │ (20MB)   │   │ (final)  │                │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                │
│       │              │              │                       │
│       ▼              ▼              ▼                       │
│   transcribe     transcribe     transcribe                  │
│       │              │              │                       │
│       ▼              ▼              ▼                       │
│  transcript[0]  transcript[1]  transcript[2]               │
│       │              │              │                       │
│       └──────────────┴──────────────┘                       │
│                      │                                      │
│                      ▼                                      │
│            Concatenated Transcript                          │
│                      │                                      │
│                      ▼                                      │
│             format-transcript                               │
│                      │                                      │
│                      ▼                                      │
│              extract-insights                               │
└─────────────────────────────────────────────────────────────┘

INTERVIEW (Uploaded/Recorded File):
┌─────────────────────────────────────────────────────────────┐
│  Downloaded blob from storage (e.g., 30MB)                  │
│                      │                                      │
│                      ▼                                      │
│            Size > 20MB? ─────┐                              │
│             │ no             │ yes                          │
│             ▼                ▼                              │
│     Single transcribe    Chunk blob                         │
│             │           ┌────┴────┐                         │
│             │           ▼         ▼                         │
│             │      Chunk 1    Chunk 2                       │
│             │         │          │                          │
│             │         ▼          ▼                          │
│             │     transcribe  transcribe                    │
│             │         │          │                          │
│             │         └────┬─────┘                          │
│             │              ▼                                │
│             └─────▶ Concatenated Transcript                 │
│                            │                                │
│                            ▼                                │
│                     parse-interview                         │
│                            │                                │
│                            ▼                                │
│                    extract-insights                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/coach/EvaluationHub.tsx` | Enable segmentation for observer notes; add blob chunking for interview transcription |
| `src/components/coach/InterviewRecorder.tsx` | Add segment tracking for live interview recording |
| `src/hooks/useAudioRecording.tsx` | No changes needed - infrastructure already exists |

---

## What Stays the Same (No Interruption)

- Recordings under 20MB work exactly as before (single blob, single transcription)
- `transcribe-audio` edge function unchanged
- `format-transcript` and `extract-insights` edge functions unchanged
- Audio playback/preview functionality unchanged
- Draft audio save/restore functionality unchanged
- All UI components unchanged

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Recording fails mid-segment | Partial transcripts stored; gaps skipped in concatenation |
| User cancels recording | Standard reset clears segment state |
| Network error on segment upload | Logged but doesn't block; gap in transcript acceptable |
| Short recording (<20MB) | Segmentation never triggers; existing path used |
| Uploaded interview file <25MB | Single transcription call (no chunking) |
| Uploaded interview file >25MB | Chunked, transcribed in parallel, concatenated |

---

## Progress Indicators

**Observer Notes** (during recording):
- "Recording..." → "Segment 1 saved (20MB)" → "Recording..." → "Segment 2 saved..."

**Interview** (during transcription):
- "Transcribing..." for small files
- "Transcribing segment 1 of 3..." for large files

