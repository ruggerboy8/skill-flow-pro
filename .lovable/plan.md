
# Auto-Formatting Pro Move Materials (OpenAI)

## Overview

This plan creates an AI-powered formatting system for doctor pro move learning materials using the **OpenAI API** (matching existing infrastructure for `format-transcript` and `extract-insights`). The system will clean up unstructured text blobs into properly formatted markdown.

---

## Current State

- **140 doctor resources** across 4 types need formatting
- Scripts and gut check questions appear as unstructured text blobs
- Project already uses `OPENAI_API_KEY` for other AI functions
- `gpt-4o-mini` is used for similar text processing tasks

---

## Implementation Details

### 1. New Edge Function: `format-pro-move-content`

**Location**: `supabase/functions/format-pro-move-content/index.ts`

Uses OpenAI API directly (matching `format-transcript` pattern):

```text
Endpoint: https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini
Auth: Bearer ${OPENAI_API_KEY}
```

**Input**:
```json
{
  "content": "raw text...",
  "contentType": "doctor_script" | "doctor_gut_check" | "doctor_why" | "doctor_good_looks_like"
}
```

**Type-Specific Formatting Rules**:

| Type | Formatting Applied |
|------|-------------------|
| `doctor_script` | Wrap quotes in blockquotes, add line breaks between examples |
| `doctor_gut_check` | Convert to bulleted list with question format |
| `doctor_good_looks_like` | Convert to bulleted list of observable behaviors |
| `doctor_why` | Add paragraph breaks, bold key concepts |

---

### 2. Batch Processing Component

**Location**: `src/components/clinical/BatchContentFormatter.tsx`

Admin tool for one-time cleanup of existing 140 resources:

- "Format All Materials" button in library header
- Progress indicator (X/140 processed)
- Preview panel showing before/after samples
- Chunked processing (5 at a time) to avoid rate limits
- "Apply Changes" to save all formatted content

---

### 3. Inline Format Buttons

**Location**: `src/components/clinical/DoctorMaterialsDrawer.tsx`

For future content entry:

- Small "Format" button next to each textarea
- Calls edge function with current content
- Shows "AI Formatted" indicator after processing
- Same pattern as existing "AI Generated" badges

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/format-pro-move-content/index.ts` | Create | OpenAI-powered formatting function |
| `supabase/config.toml` | Modify | Add function config with `verify_jwt = true` |
| `src/components/clinical/BatchContentFormatter.tsx` | Create | Batch processing UI component |
| `src/pages/clinical/DoctorProMoveLibrary.tsx` | Modify | Add "Format All" button in header |
| `src/components/clinical/DoctorMaterialsDrawer.tsx` | Modify | Add per-field format buttons |

---

## User Workflows

### One-Time Batch Processing
```text
1. Open Clinical Pro-Move Library
2. Click "Format All Materials" button
3. Confirm: "Process 140 resources?"
4. View progress bar and sample previews
5. Click "Apply Changes" to save
6. Toast: "140 materials formatted"
```

### Future Content (Per-Field)
```text
1. Open Materials drawer for a Pro Move
2. Type/paste content in any field
3. Click "Format" button next to field
4. Content replaced with structured version
5. Review and save
```

---

## Technical Notes

- Uses `gpt-4o-mini` for cost efficiency (same as `format-transcript`)
- Direct OpenAI API calls via `https://api.openai.com/v1/chat/completions`
- Leverages existing `OPENAI_API_KEY` secret
- Rate limit handling with user-friendly messages
- Batch processor uses 5-at-a-time chunking with delays

