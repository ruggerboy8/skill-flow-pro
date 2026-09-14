# Framework data export (corpus draft)

Read-only export from the live Supabase database (project `yeypngaufuualdfzcjpk`),
taken on **2026-08-20**. All files are pretty-printed JSON arrays of row objects.

## Filter used

The export covers the **platform pediatric-US framework**: `pro_moves` rows where

```sql
active = true
AND owner_org_id IS NULL          -- platform content, not org-owned copies
AND practice_types @> ARRAY['pediatric_us']
```

That yields 214 Pro Moves across role_ids 1 (Front Desk / DFI), 2 (Dental
Assistant / RDA), 3 (Office Manager), 4 (Doctor), and 11 (Lead Dental
Assistant). The other files are scoped to those 214 rows.

## Files

| File | Rows | Contents |
|---|---|---|
| `domains.json` | 4 | All rows of `domains` (Clinical, Clerical, Cultural, Case Acceptance), all columns. |
| `competencies.json` | 62 | Every `competencies` row referenced by the 214 filtered Pro Moves, all columns. Sorted by `competency_id`. |
| `pro_moves.json` | 214 | The filtered Pro Moves, all columns **except** the `curriculum_*` weight columns (`curriculum_priority`, `curriculum_priority_revenue`, `curriculum_priority_patient_exp`, `curriculum_priority_foundational`, `curriculum_priority_rationale`, `curriculum_priority_generated_at`). Sorted by `action_id`. |
| `resources.json` | 373 | `pro_move_resources` rows for those 214 action_ids, excluding `status = 'retired'` (369 active + 4 archived remain). Columns: `action_id`, `type`, `title`, `content_md`, `url`, `provider`, `display_order`, `status`. Sorted by `action_id`, then `display_order`. |

## Row counts by role (pro_moves.json)

| role_id | Role | Count |
|---|---|---|
| 1 | Front Desk (DFI) | 63 |
| 2 | Dental Assistant (RDA) | 60 |
| 3 | Office Manager | 24 |
| 4 | Doctor | 66 |
| 11 | Lead Dental Assistant | 1 |

## Resource types (resources.json)

`script` (54), `audio` (59), `video` (1), `link` (1), plus the doctor-track
markdown blocks: `doctor_why` (66), `doctor_script` (62), `doctor_gut_check`
(64), `doctor_good_looks_like` (66).

## Verification

Row counts were verified against `COUNT(*)` queries on the live DB, and the
content was verified with checksum comparisons (sum of ids and sum of text
lengths for `action_statement`/`description`/`intervention_text`,
`content_md`/`url`, and competency descriptions). All values matched the
database exactly at export time.
