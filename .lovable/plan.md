

## Redesign ProMove Picker for Clinical Director and Doctor Prep

### What's Changing

**1. Clinical Director ProMove Picker (DirectorPrepComposer.tsx)**
- Replace the flat white list with **domain tabs** (Clinical, Clerical, Cultural, Case Acceptance) matching the baseline results view style
- Each tab tinted with the domain's color using `getDomainColorRaw`
- Scores shown as **numeric** (1-4) in small colored circles matching the semantic score colors, not verbal labels
- Remove the "Gap" badge
- Show both Self and Coach score circles side-by-side on each row
- **Selected items "snatch" out** of the tab list and appear in a **"Selected for Discussion"** card pinned below the picker, with domain badge and scores visible

**2. Doctor ProMove Picker (DoctorReviewPrep.tsx)**
- Same domain-tabbed layout with domain-colored tab headers
- Numeric scores (self-score only, since doctors don't see coach scores)
- Coach's picks highlighted with a subtle badge
- Selected items similarly appear in a "Your Picks" section below the tab panel

**3. Hide Tabs During Prep Editing (DoctorDetail.tsx)**
- When `prepSessionId` is set (DirectorPrepComposer is active), the entire `Tabs` block (Overview/Baseline/Coaching Thread) is already replaced by the composer via early return
- **Bug**: The current code does this correctly at line 87-94, but the composer's `onBack` returns to the overview tab only. Need to verify the tab shell is indeed hidden. Based on the code, it already is -- the `if (prepSessionId)` early return on line 87 renders only the composer. No change needed here.

### Technical Details

**DirectorPrepComposer.tsx changes:**
- Import `Tabs, TabsContent, TabsList, TabsTrigger` from UI
- Import `getDomainColorRaw` and `getDomainColor` from domainColors
- Remove `SCORE_LABELS` map; use numeric display instead
- Define `SCORE_COLORS` (matching ClinicalBaselineResults: 4=emerald, 3=blue, 2=amber, 1=orange)
- Define `DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance']`
- Replace the single Card with domain tabs, each tab background tinted
- Each ProMove row: checkbox, action statement, competency name italic, two small score circles (Self: N, Coach: N)
- New "Selected for Discussion" card rendered between the picker and the agenda card. Shows selected items with domain badge, statement, and an X button to deselect. Empty state: "Select 1-2 Pro Moves above"

**DoctorReviewPrep.tsx changes:**
- Same domain tab treatment for Step 2
- Numeric scores instead of verbal labels
- Selected items displayed in a summary card below the tabs
- Coach's picks get a subtle "{coachName}'s pick" badge

**Files to modify:**
- `src/components/clinical/DirectorPrepComposer.tsx` -- major rework of the picker section
- `src/pages/doctor/DoctorReviewPrep.tsx` -- same tab treatment for doctor's picker
