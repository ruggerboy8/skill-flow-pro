

# Database Table Retirement Assessment

## Investigation Method
Searched all `.ts`/`.tsx` files for references to each table name (excluding `types.ts` which is auto-generated). Tables that only appear in `types.ts` and/or cleanup code in `admin-users` are strong retirement candidates.

## Safe to Drop (no application code references)

| Table | Type | Why safe |
|---|---|---|
| `weekly_scores_backup_20241124` | Table | Backup from Nov 2024. Only in `types.ts`. Has a security finding for broken RLS. No code reads it. |
| `learning_resources_legacy` | Table | Only in `types.ts`. The active system uses `pro_move_resources`. |
| `pro_move_resources_legacy` | Table | Only in `types.ts`. Junction table for the old learning resources. |
| `action_usage_stats` | View | Only in `types.ts`. No code queries it. Also flagged as missing RLS. |
| `pro_move_usage_view` | View | Only in `types.ts`. No code queries it. Also flagged as missing RLS. |
| `orphaned_scores_log` | Table | Only in `types.ts`. Was a debugging aid during migration. No code reads it. |

## Likely safe but need a decision

| Table | References | Notes |
|---|---|---|
| `alcan_weekly_plan` | `admin-users` cleanup code (2 lines) | Predecessor to `weekly_plan`. Only referenced in user-delete nullification. The cleanup lines can be removed in the same migration. |
| `manager_priorities` | `admin-users` cleanup code (1 line) | Coach priority weights. Was it ever used in production? Only referenced in user-delete. If not actively used, safe to drop. |

## NOT safe to drop yet (still actively queried)

| Table | Status | Why |
|---|---|---|
| `weekly_focus` | Deprecated | Still queried by `siteState.ts`, `sequencer-rank`, `HistoryPanel`, `ConfidenceWizard` for cycles 1-3 historical data. Needs code migration first. |
| `weekly_plan` | Deprecated | Still queried by `WeekBuilderPanel`, `PlanHistory`, `MonthView`, `GlobalPlanManager`, `ConfidenceWizard`, `sequencer-rank`, `SequencerTestConsole`, `useReliableSubmission`. Heavy usage — not ready to drop. |
| `app_kv` | Active | Used for global settings (performance time gate). Keep. |
| `reminder_templates` | Active | Used by coach reminders and clinical scheduling. Keep. |
| `coaching_agenda_templates` | Active | Used by clinical director prep. Keep. |
| `excused_locations` | Active | Heavily used across confidence/performance wizards, coach reminders. Keep. |

## Recommended Plan

### Migration 1: Drop unused tables/views

```sql
-- Views first (no dependencies)
DROP VIEW IF EXISTS action_usage_stats;
DROP VIEW IF EXISTS pro_move_usage_view;

-- Tables with no code references
DROP TABLE IF EXISTS weekly_scores_backup_20241124;
DROP TABLE IF EXISTS learning_resources_legacy CASCADE;
DROP TABLE IF EXISTS pro_move_resources_legacy;
DROP TABLE IF EXISTS orphaned_scores_log;
DROP TABLE IF EXISTS alcan_weekly_plan;
```

### Migration 2: Clean up admin-users references

Remove the 2 `alcan_weekly_plan` lines and optionally the `manager_priorities` delete line from `admin-users/index.ts`.

### After migration: Regenerate types

Run `npx supabase gen types` to clean up `types.ts` — this alone will significantly reduce the file size and make the schema easier to read.

### Total reduction: 7 tables/views dropped

This removes 7 objects from the schema without affecting any user-facing functionality. The `weekly_focus` and `weekly_plan` tables are the biggest clutter contributors but still have active code paths — those need a separate code migration effort before they can be retired.

