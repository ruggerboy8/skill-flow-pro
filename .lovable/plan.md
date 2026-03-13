

## Tier 1 — Design System Token Unification

Four changes, all pure visual refactors with no behavior impact.

---

### 1A — Consolidate Domain Colors (3 → 1)

**Current state:** CSS vars (`--domain-planning` etc.) defined in `index.css` and `tailwind.config.ts` but **never used** anywhere. All components use `getDomainColor()` / `getDomainColorRich()` from `domainColors.ts` or hardcoded Tailwind classes in `DOMAIN_META` (`constants/domains.ts`).

**Changes:**
- **`src/index.css`**: Replace `--domain-planning/environment/interactions/learning-experiences` with `--domain-clinical`, `--domain-clerical`, `--domain-cultural`, `--domain-case-acceptance` using the rich HSL values from `domainColorsRich`
- **`tailwind.config.ts`**: Update `domain` color keys to `clinical`, `clerical`, `cultural`, `case-acceptance` pointing at new CSS vars
- **`src/lib/domainColors.ts`**: Refactor to read from CSS vars as source of truth, keep `getDomainColor()` / `getDomainColorRich()` API stable
- **`src/lib/constants/domains.ts`**: Replace hardcoded Tailwind chip classes in `DOMAIN_META` with inline styles using `getDomainColor()` — or better, provide a `chipStyle` object alongside `chipClass` so consumers can use either

---

### 1B — StatusBadge Component + Tokens

**Current state:** `StatusPill` is duplicated inline in `CoachDashboardV2.tsx` (lines 351-378) and `StaffDetailV2.tsx` (lines 156-196) with slight drift (Excused uses `bg-muted` vs `bg-slate-100`). Also appears in `ScoreHistoryV2.tsx` and `StatsScores.tsx`.

**Changes:**
- **`src/index.css`**: Add `--status-complete`, `--status-missing`, `--status-late`, `--status-excused`, `--status-pending` tokens
- **`src/components/ui/StatusBadge.tsx`** (new): Single component accepting `status: 'complete' | 'missing' | 'late' | 'excused' | 'pending' | 'exempt'`, renders `Badge` with token-derived colors
- **Replace** inline `StatusPill` in: `CoachDashboardV2.tsx`, `StaffDetailV2.tsx`, `ScoreHistoryV2.tsx`, `StatsScores.tsx`

---

### 1C — Score Color Tokens (1–4)

**Current state:** `NumberScale.tsx` hardcodes `bg-orange-100/border-orange-300` for 1, `bg-amber-100` for 2, `bg-blue-100` for 3, `bg-emerald-100` for 4. Same pattern repeated in eval components.

**Changes:**
- **`src/index.css`**: Add `--score-1` through `--score-4` CSS custom properties
- **`src/components/NumberScale.tsx`**: Replace `getSemanticColor()` hardcoded Tailwind with inline styles using the tokens
- Scan and update other score-color consumers (eval results components, baseline results)

---

### 1D — Add `text-2xs` Utility

**Current state:** `text-[10px]` appears in **42 files** (~340 matches).

**Changes:**
- **`tailwind.config.ts`**: Add `fontSize: { '2xs': ['0.625rem', { lineHeight: '0.875rem' }] }` to `theme.extend`
- **All 42 files**: Replace `text-[10px]` → `text-2xs` (mechanical find-and-replace, no logic change)

---

### Execution order

1D first (simple grep-replace, highest file count, zero risk), then 1A (domain consolidation), then 1C (score tokens), then 1B (StatusBadge component extraction — touches most logic).

