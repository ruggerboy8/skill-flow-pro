# Transcription / Recording Spike — Evaluation Overhaul (Workstream C)

*Date: 2026-06-24. Feeds [`evaluation-overhaul.md`](evaluation-overhaul.md) §2.2.*
*Question: is the current Whisper + ElevenLabs fallback the right foundation for the rebuilt
per-domain capture, or should we move to a different browser-side transcription approach?*

> Recommendation doc grounded in the current code, not an empirical prototype. Where it asserts a
> failure mode, it cites the line that causes it.

---

## 0. Recommendation (TL;DR)

**The per-domain capture model dissolves most of the current jank for free.** The pain is almost
entirely a consequence of trying to record one long, pausable, multi-megabyte take. The rebuilt
flow records several **short, single-take clips** (one per domain brain-dump), and short clips:

- never approach Whisper's 25MB limit, so the **segmentation/chunking machinery can be deleted**;
- are recorded in one take, so the **pause/resume corruption disappears**;
- rarely hit the format-rejection path, so the **ElevenLabs fallback stops being load-bearing**.

So the recommended foundation is **simplify, do not re-platform**: keep Whisper as the single STT
provider, record short single-take clips, and remove the chunking + pause + dual-provider routing.
Treat **streaming/realtime STT as an optional later enhancement** (live transcript UX), not a
prerequisite. It adds a new dependency and is not needed to fix reliability.

---

## 1. Where the current jank actually comes from

| Source | Evidence | Fixed by short single-take clips? |
|---|---|---|
| **Pause/resume produces webm Whisper rejects** as "Invalid file format" | recorder comment [`useAudioRecording.tsx:130`](../../src/hooks/useAudioRecording.tsx); fallback [`transcribe-audio/index.ts:167`](../../supabase/functions/transcribe-audio/index.ts) | **Yes.** No pause in the happy path. |
| **Segmentation at 20MB slices the webm stream mid-container**, so later segments can lack a valid EBML header | `finalizeCurrentSegment` builds `new Blob(chunks)` without re-initializing the container ([`useAudioRecording.tsx:90`](../../src/hooks/useAudioRecording.tsx)); 20MB threshold at `:164` | **Yes.** Short clips never segment; delete the path. |
| **Dual-provider routing** (Whisper <25MB, ElevenLabs >25MB or on format rejection) doubles the surface and gives two different output styles | `transcribe-audio/index.ts:148-178` | **Mostly.** Short clips stay on Whisper; ElevenLabs becomes unnecessary. |
| **No live feedback** — fully batch (record → upload → transcribe), so the user cannot tell capture is working until the end | `handleFinishAndTranscribe` flow described in the analysis | **No.** This is a UX gap, addressed only by streaming (see §3). |
| Silent-clip hallucination (e.g. "visit www.fema.gov") | guarded at `transcribe-audio/index.ts:131` (<3KB) | Keep the guard regardless. |

The takeaway: four of the five issues are artifacts of the long-pausable-take design, not of Whisper
itself. Change the recording shape and they evaporate.

---

## 2. Recommended foundation — "short clip, single provider"

1. **One short clip per domain brain-dump.** No pause button in the happy path; if the evaluator
   wants to stop and continue, that is a new clip appended to the domain's transcript, not a
   paused-and-resumed single file.
2. **Delete segmentation/chunking.** Remove `enableSegmentation`, `finalizeCurrentSegment`, the
   20MB threshold, and `audioChunking.ts`. Short clips are well under 25MB.
3. **Single STT provider (Whisper).** Drop the ElevenLabs branch from the happy path. Keep the
   existing MIME-to-extension mapping (`transcribe-audio/index.ts:21`) and the domain-vocabulary
   prompt (`:38`), which materially help accuracy. The dental-vocabulary prompt should be generalized
   from "baseline assessment of a pediatric dentist" to the per-domain staff context.
4. **Keep the resilient bits that earned their place:** the <3KB silence guard and the
   200-with-structured-error response (`:204`) so the client always sees a real message.
5. **Prefer a widely-accepted codec.** Keep the `MediaRecorder.isTypeSupported` probe
   (`useAudioRecording.tsx:132`); `audio/webm;codecs=opus` on Chrome/Firefox and `audio/mp4` on
   Safari both transcribe cleanly in a single take.

This is the lowest-risk, highest-reliability move and is a prerequisite for any UI rebuild.

---

## 3. Optional enhancement — streaming / realtime STT

Worth it only if live transcript feedback is a product goal. Tradeoffs:

- **Pro:** the evaluator sees words appear as they speak, which confirms capture is working and
  makes the brain-dump feel responsive. Removes the upload-then-wait beat.
- **Con:** a new dependency and a websocket/streaming integration; another vendor key and cost line;
  more moving parts than a single REST transcription call.
- **Candidates:** OpenAI realtime/streaming transcription (keeps us on one vendor), Deepgram, or
  AssemblyAI realtime. If we go streaming, prefer the one-vendor option to avoid re-introducing the
  dual-provider divergence we are removing in §2.

**Recommendation:** ship §2 first. Revisit streaming after the per-domain flow is real and we can
judge whether the batch "record short clip → transcribe" beat actually feels slow. Do not block the
rebuild on it.

---

## 4. Text path (no STT)

Per the overhaul decision, text input is equal-weight with voice. Typed input skips STT entirely:

- The **Polish / Magic button** runs the cleanup/coachify step (the role currently played by
  `format-transcript`) directly on typed text.
- This means the "polish" capability must be factored out of the transcription pipeline so both
  voice transcripts and typed text flow through the same coachify step before slotting.

---

## 5. Recorder extraction (the refactor that lands with this)

Regardless of provider choice, lift recording out of the 1,901-line `EvaluationHub` god-component:

- `EvaluationHub` currently owns ~15 pieces of recording/transcription state
  (`isTranscribingObservation`, `segmentTranscripts`, `currentRecording`, the competency-tap
  timeline, etc.).
- Target: a small `useDomainCapture` hook (record one clip → transcribe → return text) plus a
  presentational capture component, with no segmentation and no tap-tagging timeline.
- The existing `useAudioRecording` hook shrinks considerably once segmentation and pause are gone;
  much of its surface (`segments`, `estimatedSize`, `currentSegmentIndex`, `onSegmentReady`) can be
  removed.

---

## 6. Net deletions enabled

- `src/lib/audioChunking.ts` (whole file).
- Segmentation surface of `useAudioRecording.tsx` (`enableSegmentation`, `finalizeCurrentSegment`,
  segment state/refs).
- ElevenLabs branch + 25MB routing in `transcribe-audio/index.ts` (keep the function, simplify it).
- The competency-tap timeline plumbing in `EvaluationHub` (already slated for removal in EX1).
