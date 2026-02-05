# Client-Side Audio Segmentation: Observer Notes + Interview Transcript

## Status: ✅ IMPLEMENTED

---

## Overview

Automatic chunking of large audio recordings at ~20MB boundaries, transcribe each chunk through Whisper, and concatenate the transcripts. This removes the need for any fallback service and works for **both** recording types.

---

## Implementation Summary

### Files Created
- `src/lib/audioChunking.ts` - Utility for chunking blobs and parallel transcription

### Files Modified
- `src/pages/coach/EvaluationHub.tsx`
  - Enabled segmentation in `useAudioRecording` hook
  - Added `handleObserverSegmentReady` callback for real-time segment transcription
  - Updated `handleTranscribeObservation` to concatenate segment transcripts
  - Updated `handleTranscribeInterview` to use `transcribeWithChunking` utility
  - Added `chunkProgress` state for UI feedback

- `src/components/coach/InterviewRecorder.tsx`
  - Refactored to use `useAudioRecording` hook with segmentation
  - Added `handleSegmentReady` callback for real-time segment transcription
  - Updated `onTranscribe` prop to pass segment transcripts to parent

---

## How It Works

### Observer Notes (Live Recording)
1. Recording starts with `enableSegmentation: true`
2. When recording reaches ~20MB, a segment is automatically finalized
3. Each segment is immediately transcribed via `transcribe-audio` edge function
4. Transcripts are stored in `segmentTranscripts` array indexed by segment number
5. When recording stops, final segment is transcribed
6. All transcripts are concatenated in order before formatting

### Interview (Uploaded/Stored Files)
1. File is downloaded from storage
2. If file > 20MB, `transcribeWithChunking` splits it into chunks
3. All chunks are transcribed in parallel
4. Transcripts are sorted by index and concatenated
5. Combined transcript is parsed and analyzed

---

## Safety Features

- **Recordings under 20MB work exactly as before** - segmentation never triggers
- **No edge function changes** - `transcribe-audio` continues to work as-is
- **Failed segments don't block recording** - gaps are logged but recording continues
- **Index-based ordering** - transcripts are always concatenated in correct order

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Recording fails mid-segment | Empty string stored, gap skipped in concatenation |
| User cancels recording | Standard reset clears segment state |
| Network error on segment upload | Logged, gap in transcript acceptable |
| Short recording (<20MB) | Segmentation never triggers |
| Uploaded interview file <20MB | Single transcription call |
| Uploaded interview file >20MB | Chunked, transcribed in parallel, concatenated |
