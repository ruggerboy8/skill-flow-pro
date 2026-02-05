

# Doctor Baseline Results View

## Overview

This plan creates a calibration-focused results view for doctors who have completed their baseline self-assessment. The design emphasizes identity statements over metrics, using rating bands (4, 3, 2, 1) with challenging labels that encourage honest self-reflection.

---

## Architecture

### New Route
- **Path**: `/doctor/baseline-results`
- Accessible from Doctor Home page after baseline completion
- Read-only view (no inline editing; optional "flag for discussion" actions)

### New Components

| Component | Purpose |
|-----------|---------|
| `DoctorBaselineResults.tsx` | Main page with header, tally, and domain tabs |
| `RatingBandCollapsible.tsx` | Reusable collapsible band (4, 3, 2, 1) with calibration label |

---

## Page Structure

### Header Section
```text
Baseline Self-Assessment
Completed [date]

"This is a self-calibration snapshot. Ratings are most useful 
when they reflect consistency, not intent."
```

### Tally Row (Simple Counts)
```text
4: __ moves  |  3: __ moves  |  2: __ moves  |  1: __ moves
```
- No charts or graphs
- Simple horizontal layout with subtle separators
- Each count styled with score color for visual consistency

### Domain Tabs
```text
[ Clinical ] [ Clerical ] [ Cultural ] [ Case Acceptance ]
```
- Uses existing `Tabs` component
- Each tab contains 4 rating bands
- Defaults to first domain with content

---

## Rating Bands (Per Domain)

Each domain tab displays 4 collapsible sections, always in order 4 -> 1:

### Band 4 (Expanded by default)
- **Label**: "4 - Consistent, even when you're behind"
- **Subtext**: "If this is a 4, you're saying you could model it on demand and your team would see it most days."

### Band 3 (Collapsed)
- **Label**: "3 - Usually, with predictable misses"  
- **Subtext**: "If this is a 3, you're saying it's part of your standard approach, but you can name when it slips."

### Band 2 (Collapsed)
- **Label**: "2 - Sometimes, not yet reliable"
- **Subtext**: "If this is a 2, you're saying you do it occasionally, but it's not consistent across patients/days."

### Band 1 (Collapsed)
- **Label**: "1 - Rare / not in your current routine"
- **Subtext**: "If this is a 1, you're saying it doesn't reliably show up today."

### Items Within Bands
- Pro Move title (tappable to open materials drawer)
- Clicking opens existing `DoctorMaterialsSheet` with full learning content

---

## Gut Check Prompt (Per Domain)

At top of each domain tab, above the bands:

```text
"Quick gut check: do the items in your '4' list feel true on your busiest day?"

[ Yes, feels accurate ]  [ Some might be generous ]
```

**Behavior**:
- "Yes, feels accurate" - dismisses prompt, stores acknowledgment
- "Some might be generous" - shows toast: "You can discuss these with Alex in your check-in" and stores a flag

The flags are stored in a simple `doctor_baseline_flags` column or table for coach visibility, but do not change scores. This preserves the baseline snapshot.

---

## Data Flow

### Fetch Baseline Items
```sql
SELECT 
  dbi.action_id,
  dbi.self_score,
  pm.action_statement,
  c.name as competency_name,
  d.domain_name,
  d.color_hex
FROM doctor_baseline_items dbi
JOIN pro_moves pm ON dbi.action_id = pm.action_id
JOIN competencies c ON pm.competency_id = c.competency_id  
JOIN domains d ON c.domain_id = d.domain_id
WHERE dbi.assessment_id = [assessment_id]
```

### Group by Domain -> Score
```typescript
{
  Clinical: { 4: [...], 3: [...], 2: [...], 1: [...] },
  Clerical: { 4: [...], 3: [...], 2: [...], 1: [...] },
  ...
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/doctor/DoctorBaselineResults.tsx` | Create | Main results page |
| `src/components/doctor/RatingBandCollapsible.tsx` | Create | Reusable band component |
| `src/components/doctor/GutCheckPrompt.tsx` | Create | Domain-level gut check widget |
| `src/pages/doctor/DoctorHome.tsx` | Modify | Add "View My Baseline" button when complete |
| `src/App.tsx` | Modify | Add route `/doctor/baseline-results` |

---

## Doctor Home Page Update

After baseline completion, the card changes to:

```text
[CheckCircle icon]
Baseline Complete
Completed [formatted date]

[View My Baseline] button
```

The "View My Baseline" button navigates to `/doctor/baseline-results`.

---

## Visual Design

### Color Scheme
- Band headers use subtle background tints based on score:
  - 4: Light green tint
  - 3: Light blue tint  
  - 2: Light amber tint
  - 1: Light red tint
- Domain tabs use existing domain color system
- Pro Move items have hover state and arrow indicator

### Responsive
- Works on desktop and tablet
- Domain tabs wrap on mobile
- Bands are full-width collapsibles

---

## Database Addition (Optional)

If implementing the "flag for discussion" feature:

```sql
ALTER TABLE doctor_baseline_assessments 
ADD COLUMN flagged_domains text[] DEFAULT '{}';
```

This stores domain names where the doctor clicked "Some might be generous" for coach visibility.

---

## Future Considerations

- **Coach View**: The Clinical Director can see which domains a doctor flagged
- **Export**: Add ability to export baseline as PDF for doctor records
- **Time Travel**: Eventually show baseline vs. later self-assessment if doctors re-take

