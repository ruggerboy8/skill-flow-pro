## Goal

Replace the two stacked collapsibles on the doctor detail page with a **single collapsible "Assessments" module** above the coaching thread. Inside it, two columns:

- **Left:** doctor self-assessments (today: baseline; later: follow-ups)
- **Right:** clinical director reviews (today: private baseline; later: periodic CD reviews)

Clicking a card **opens its results in a pop-out** (right-side Sheet), not inline.

## Layout

```text
[ Header: name + journey pill + next-action ]
[ Pre-session actions ]

▼ Assessments                                    [Doctor: ✔  ·  CD: ◯]
┌─────────────────────────────┬─────────────────────────────┐
│ DOCTOR SELF-ASSESSMENTS     │ CLINICAL DIRECTOR REVIEWS   │
│                             │                             │
│ ┌─────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ Baseline                │ │ │ Private Baseline        │ │
│ │ ✔ Complete · Jun 4      │ │ │ ◯ Not started           │ │
│ │ [Open results →]        │ │ │ [Start assessment]      │ │
│ └─────────────────────────┘ │ └─────────────────────────┘ │
│  (future follow-ups stack)  │  (future periodic stack)    │
└─────────────────────────────┴─────────────────────────────┘

Coaching Thread
[ ... existing thread ... ]
```

- Section is wrapped in a single `Collapsible`. Collapsed header shows the title plus tiny per-column status chips (e.g. ✔ Complete / ◯ Not started) so the CD can see state at a glance without expanding.
- **Default state:** expanded when either side is incomplete, collapsed when both are complete (so finished setups stay out of the way). Persisted in component state for the session.
- Columns: 1 col mobile, 2 cols ≥md. Each column is an independent vertical stack of cards.

## Pop-out behavior

Clicking "Open results" on a card opens a right-side shadcn `Sheet` (`w-full sm:max-w-3xl lg:max-w-5xl`) with the results rendered inside. Rationale: results views are tall/scrollable, and keeping the doctor detail / coaching thread mounted in the background lets the CD reference them while prepping.

The "Start / Continue assessment" action for the private baseline still launches the existing full-page `CoachBaselineWizard` — unchanged.

One `expandedAssessmentKey` state controls which Sheet is open.

## Components

### New: `src/components/clinical/AssessmentTrackCard.tsx`
Single tile used in either column.

```ts
type AssessmentCardStatus = 'not_started' | 'in_progress' | 'completed' | 'locked';

interface AssessmentTrackCardProps {
  title: string;
  subtitle?: string;
  status: AssessmentCardStatus;
  statusDate?: string | null;
  icon?: LucideIcon;
  onOpenResults?: () => void;
  primaryAction?: { label: string; onClick: () => void; variant?: 'default'|'outline' };
  disabledHint?: string;
}
```

Uses existing glass `Card`. Status pill uses semantic status tokens. No new tokens.

### New: `src/components/clinical/AssessmentResultsSheet.tsx`
Thin wrapper around shadcn `Sheet` with sticky header (title + close). Used by both doctor-baseline and private-baseline results.

### Edit: `src/pages/clinical/DoctorDetail.tsx`
- Remove both existing `<Collapsible>` blocks.
- Add one `<Collapsible>` wrapping the new two-column section.
- Build `selfAssessments` and `directorAssessments` arrays from existing queries.
- Manage `expandedAssessmentKey: 'doctor_baseline' | 'coach_baseline' | null` and render the appropriate Sheet body:
  - `doctor_baseline` → `<ClinicalBaselineResults …/>`
  - `coach_baseline` → contents of `DoctorDetailBaseline` (without outer Card chrome)

### Edit: `src/components/clinical/DoctorDetailBaseline.tsx`
Strip outer `Card` so its contents compose cleanly inside the Sheet. Summary metadata moves to the `AssessmentTrackCard`.

## File changes

- New: `src/components/clinical/AssessmentTrackCard.tsx`
- New: `src/components/clinical/AssessmentResultsSheet.tsx`
- Edit: `src/pages/clinical/DoctorDetail.tsx`
- Edit: `src/components/clinical/DoctorDetailBaseline.tsx`

No backend, RLS, query, or doctor-facing changes. The three existing queries (`doctor`, `baseline`, `coachAssessment`) feed everything.

## Future extensibility

- New self-assessment type → add a query, push a card into `selfAssessments`, add a Sheet case.
- New CD review type → same on the director column.
- Module stays one collapsible regardless of how many cards each column holds.

## Out of scope

- No changes to wizards, coaching thread, journey-pill logic, RLS, or doctor-facing UI.
- No new design tokens.
- Not building future follow-up / periodic-review data models — only the layout that will host them.
