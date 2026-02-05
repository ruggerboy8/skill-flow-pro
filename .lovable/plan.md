
# Batch Processor Safety Improvements

## Overview
Add safeguards to prevent runaway costs and give users control over the batch processing operation.

---

## Changes to BatchTranscriptProcessor.tsx

### 1. Stop Button with AbortController

Add a ref to track an `AbortController` that can cancel in-flight requests:

```typescript
const abortControllerRef = useRef<AbortController | null>(null);
const [isStopping, setIsStopping] = useState(false);

function stopProcessing() {
  setIsStopping(true);
  abortControllerRef.current?.abort();
}
```

The Process All loop checks for abort signal between items:

```typescript
for (let i = 0; i < pendingItems.length; i++) {
  if (abortControllerRef.current?.signal.aborted) {
    break; // Exit loop cleanly
  }
  // ... process item
}
```

### 2. Confirmation Dialog Before Processing

Show an AlertDialog when clicking "Process All":

```text
┌─────────────────────────────────────────────────┐
│ ⚠️ Confirm Batch Processing                      │
├─────────────────────────────────────────────────┤
│ This will process 21 evaluations:               │
│                                                 │
│ • 18 need transcription + insights              │
│ • 3 need insights only                          │
│                                                 │
│ Estimated cost: ~$1.50 - $2.50                  │
│ Estimated time: ~5-10 minutes                   │
│                                                 │
│ You can stop at any time, but already-          │
│ processed items will remain updated.            │
│                                                 │
│              [Cancel]  [Start Processing]       │
└─────────────────────────────────────────────────┘
```

### 3. Delay Between Requests

Add a 1-second delay between processing each item to:
- Avoid hitting OpenAI rate limits
- Give UI time to update smoothly
- Reduce perceived "runaway" feeling

```typescript
await new Promise(resolve => setTimeout(resolve, 1000));
```

### 4. UI Updates

Replace "Process All" button with "Stop" when processing:

```typescript
{isProcessing ? (
  <Button
    variant="destructive"
    size="sm"
    onClick={stopProcessing}
    disabled={isStopping}
  >
    <Square className="w-4 h-4 mr-2" />
    {isStopping ? 'Stopping...' : 'Stop'}
  </Button>
) : (
  <Button size="sm" onClick={() => setShowConfirmDialog(true)}>
    <Play className="w-4 h-4 mr-2" />
    Process All
  </Button>
)}
```

---

## Implementation Summary

| Feature | Implementation |
|---------|----------------|
| Stop button | `AbortController` ref + "Stop" button that replaces "Process All" |
| Confirmation dialog | `AlertDialog` showing counts and cost estimate |
| Rate limiting | 1-second delay between items |
| Clean abort | Check `signal.aborted` in loop, mark remaining as "pending" |
| Cost estimate | Calculate based on counts: ~$0.08 per transcription item, ~$0.03 per insights-only item |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/eval-results-v2/BatchTranscriptProcessor.tsx` | Add AbortController, confirmation dialog, stop button, delays |
