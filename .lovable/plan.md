## Practice Type on Roles + Multi-Select Practice Type on Pro Moves

**Status: ✅ Complete**

### What changed

1. **Practice types expanded** to three region-specific values: `pediatric_us`, `general_us`, `general_uk`
2. **`roles.practice_type`** column added — each role belongs to one practice type
3. **`pro_moves.practice_type`** converted to **`pro_moves.practice_types TEXT[]`** — array-based multi-select
4. All existing data backfilled (`pediatric` → `pediatric_us`, `general` → `general_us`, `all` → all three)

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Schema: expanded CHECK on orgs, added practice_types array on pro_moves, added practice_type on roles |
| `RoleFormDrawer.tsx` | Added practice type Select (3 options) |
| `PlatformRolesTab.tsx` | Shows practice type badge on role cards, fetches practice_type |
| `ProMoveForm.tsx` | Replaced single Select with multi-checkbox for practice_types |
| `DoctorProMoveForm.tsx` | Defaults practice_types to `['pediatric_us']` |
| `OrgBootstrapDrawer.tsx` | 3 radio options with new labels |
| `PlatformOrgsTab.tsx` | Badge display for all 3 practice types |
| `OrgProMoveLibraryTab.tsx` | Uses `.overlaps('practice_types', [orgPracticeType])` |
| `ProMoveList.tsx` | Uses `.overlaps('practice_types', [filter])` |
| `ProMoveLibrary.tsx` | Updated filter chips to 4 options (All + 3 types) |

## Tier 1 — Design System Token Unification

**Status: ✅ Complete**

### 1A — Consolidate Domain Colors (3→1)
- Replaced unused `--domain-planning/environment/interactions/learning-experiences` CSS vars with `--domain-clinical/clerical/cultural/case-acceptance` (rich + pastel)
- Updated `tailwind.config.ts` domain keys to match
- `domainColors.ts` exports CSS var names; API unchanged
- `DOMAIN_META` in `constants/domains.ts` now uses `chipStyle()` with token-derived colors

### 1B — StatusBadge Component + Tokens
- Added `--status-complete/missing/late/excused/pending` CSS tokens to `index.css`
- Created `src/components/ui/StatusBadge.tsx` with token-driven colors
- Replaced inline `StatusPill` in `CoachDashboardV2`, `StaffDetailV2`, `ScoreHistoryV2`, `StatsScores`

### 1C — Score Color Tokens (1–4)
- Added `--score-1` through `--score-4` (+ `-bg` pastel variants) to `index.css`
- Updated `NumberScale.tsx` to use inline styles with CSS vars instead of hardcoded Tailwind

### 1D — text-2xs Utility
- Added `fontSize: { '2xs': ['0.625rem', { lineHeight: '0.875rem' }] }` to `tailwind.config.ts`
- Replaced all 340 occurrences of `text-[10px]` → `text-2xs` across 42 files

## Micro-Celebrations + Mobile Slide Transitions

**Status: ✅ Complete**

### 3A — Confetti on Celebration Moments
- Added `canvas-confetti` dependency
- Created `src/lib/confetti.ts` helper with `fireCelebration()` function
- PerformanceWizard: confetti fires on victory modal open + on successful non-repair submit
- ConfidenceWizard: confetti fires on successful non-repair submit

### 3B — Submit Button Checkmark Animation
- Added `submitPhase` state (`idle` | `saving` | `done`) to both wizards
- Submit button transitions: text → spinner → green ✓ checkmark with scale-in animation
- 1.8s celebration delay before navigating (0.8s for repair mode)

### 4A — Mobile Slide Transitions
- Added `framer-motion` dependency
- Wrapped wizard step content in `<AnimatePresence mode="wait">` with directional slide variants
- Forward (Next): slides in from right, exits left
- Backward (Back): slides in from left, exits right
- 200ms ease-out transitions; progress dots and sticky footer stay static
