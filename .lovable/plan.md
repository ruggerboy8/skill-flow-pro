

# Guided Paste Import for Pro Moves

## Approach

Replace the file-upload step with a two-step flow: (1) select target role + practice types, (2) paste tab-separated data from a spreadsheet. The existing preview/apply steps stay the same.

When you copy cells from Excel/Google Sheets, the clipboard contains tab-separated values (TSV). This is simpler than CSV parsing and maps directly to the copy-paste workflow.

## User flow

```text
Step 1: Configure
  - Select target role (dropdown)
  - Select practice type(s) (checkboxes)
  → competencies are fetched for the selected role

Step 2: Paste
  - Large textarea: "Paste rows from your spreadsheet"
  - Expected columns shown above textarea:
    competency_name | text | description | intervention_text | script
  - Only competency_name and text are required
  - Parse on paste or on "Review" button click

Step 3: Review (existing preview table)
  - Validate competency names against selected role's competencies
  - Show fuzzy-match suggestions for unmatched names
  - New/update/error badges as before

Step 4: Apply (existing)
```

## Changes

### `src/components/admin/BulkUpload.tsx` — rewrite

**Step state**: Change from `'upload' | 'preview' | 'complete'` to `'config' | 'paste' | 'preview' | 'complete'`

**Step 1 — Config UI**:
- Role dropdown (fetched from `roles` table, passed as prop — already available)
- Practice type checkboxes for `pediatric_us`, `general_us`, `general_uk`
- When role is selected, fetch that role's competencies from Supabase (scoped query)
- "Next" button enabled when role + at least one practice type selected

**Step 2 — Paste UI**:
- Show expected column headers as a reference strip
- Large `<Textarea>` with placeholder showing tab-separated example
- "Review" button parses the pasted text

**Paste parsing logic**:
- Split by newlines, then split each line by tabs
- First row = headers (auto-detect by matching known column names)
- If no header row detected (no "competency_name" in first row), assume column order: `competency_name, text, description, intervention_text, script`
- `role_name` and `practice_types` are NOT expected in paste — they come from Step 1

**Competency validation**:
- Match `competency_name` against only the selected role's competencies (case-insensitive)
- For unmatched names, do a simple substring/similarity check and show "Did you mean: X?" in the error column

**Apply step**:
- Inject `role_id` from Step 1 selection into every row
- Inject `practice_types` from Step 1 into every row
- Pass to existing `bulk_upsert_pro_moves` RPC as before

### `src/components/admin/ProMoveLibrary.tsx`

- Keep the "Bulk Upload" button but rename to "Import Pro Moves"
- No other changes needed — BulkUpload props stay the same

### No RPC changes needed

The existing `bulk_upsert_pro_moves` RPC already accepts `role_name` and `practice_types` per row. We just populate them from the wizard context instead of requiring them in the paste data.

### Keep CSV upload as fallback

Add a small "or upload CSV" link on the paste step for backward compatibility. If clicked, show the existing file input. The CSV path still works as before.

## What stays the same
- Preview table UI (status icons, badges, error download)
- Apply logic and RPC call
- Complete step with results summary

