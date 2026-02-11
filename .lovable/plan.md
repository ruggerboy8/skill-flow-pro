

# Evaluation Review Wizard -- Final Polish

## Summary

Expand the wizard from 5 steps to 7, with each step having its own page and a warm, encouraging narrative. Add a "Note to Self" free-response step and display it on the Home focus card. Polish the coach note toggle and fix back-button behavior.

---

## Step-by-Step Flow (7 Steps)

### Step 0 -- Welcome

**Title:** "{periodLabel} Evaluation Review"

**Body:**
> "Nice work completing your evaluation! Let's take a couple of minutes to look at what stood out and set yourself up for a great quarter."
>
> Here's what we'll do together:
> 1. **Take a look at your full evaluation** -- review all your scores and notes
> 2. **Check out your highlights** -- see where you're shining and where you can grow
> 3. **Pick a strength to keep crushing** -- choose one area you're already rocking
> 4. **Choose two areas to grow** -- select competencies to focus on this quarter
> 5. **Pick your ProMoves** -- practical actions to help you improve
> 6. **Write a note to yourself** -- a personal reminder for the quarter ahead
>
> "Your selections will be pinned to your Home page so they're always easy to find."

**CTA:** "Let's Go" | "Exit to Home"

### Step 1 -- View Full Evaluation (unchanged logic)

**Body text update:**
> "Before we dive in, take a moment to look through all your scores and coach notes. There's no rush -- come back whenever you're ready."

**Skip text:** "I've already looked through it -- let's keep going"

### Step 2 -- Highlights

- Rename "Opportunities" heading to **"Opportunities for Growth"**
- Strengths intro: "Here are a couple of areas where you really stood out."
- Opportunities intro: "And here are a couple of areas where a little extra focus could make a big difference."

### Step 3 -- Keep Crushing (NEW -- separate page, pick 1)

**Title:** "Keep Crushing"

**Body:**
> "These were some of your strongest competencies this quarter. Pick one that you want to keep performing at a high level -- it's worth celebrating what you're already doing well."

Show all `top_candidates` as selectable cards (radio-style).
If `top_used_fallback`: title becomes "Your Strongest Areas" with slightly adjusted copy.

**CTA:** "Next" (enabled when 1 selected)

### Step 4 -- Improve This Quarter (NEW -- separate page, pick 2)

**Title:** "Grow This Quarter"

**Body:**
> "These are some competencies that could really benefit from a little extra attention. Choose 2 that feel most important for you to focus on -- even small improvements here can make a real difference."

Show all `bottom_candidates` as selectable cards (checkbox-style, max 2).

**Progress:** "X of 2 selected"
**CTA:** "Next" (enabled when 2 selected)

### Step 5 -- ProMoves (updated copy)

**Title:** "Choose Your ProMoves"

**Body:**
> "From the two areas you chose to grow in, which ProMoves feel most important for you right now? Pick 1 to 3 that you want to focus on this quarter."

Same logic as current Step 4 otherwise.

### Step 6 -- Note to Self (NEW)

**Title:** "Note to Self"

**Body:**
> "Before you wrap up, take a moment to write yourself a quick reminder. What do you want to make sure you keep in mind this quarter?"

**Placeholder:** "This quarter, I want to make sure I..."

- Textarea, max 500 characters, with live character count
- Primary CTA: "Complete My Review" (always enabled -- note is optional)
- If they leave it blank, still completes fine

### Step labels
`['Welcome', 'Full Evaluation', 'Highlights', 'Keep Crushing', 'Grow', 'ProMoves', 'Note to Self']`

---

## Back Button Fix

Store current `step` in `sessionStorage` keyed by `eval-review-step-{evalId}`. On mount, restore from storage. This way, navigating to the full evaluation page and pressing browser back returns to the correct step instead of restarting at Step 0.

---

## Coach Note Toggle (CompetencyCard)

- Rename from "Coach note" to **"View Coach Notes"**
- Style: `text-sm font-medium text-primary` (more prominent than current `text-xs text-muted-foreground`)
- Keep the chevron icon

---

## Database Migration

1. **Add column:** `ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS learner_note text;`
2. **Update RPC** `save_eval_acknowledgement_and_focus` to accept `p_learner_note text DEFAULT NULL` and store it:
   ```text
   UPDATE evaluations
   SET acknowledged_at = COALESCE(acknowledged_at, now()),
       learner_note = COALESCE(p_learner_note, learner_note)
   WHERE id = p_eval_id;
   ```

---

## Home Focus Card -- Display Learner Note

In `CurrentFocusCard.tsx`:
- Add `learner_note` to the eval select query
- If present, render it at the top of the card content as a warm callout:
  - Left border accent, italic text, subtle background
  - Small label: "My note" with a quote-style presentation

---

## Completion Toast

Change from "Focus saved and review completed!" to:
> "You're all set! Your focus is pinned to Home."

---

## Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/new.sql` | New -- add `learner_note` column, update RPC |
| `src/pages/EvaluationReview.tsx` | Rewrite -- 7-step flow with warm copy, sessionStorage persistence |
| `src/components/review/CompetencyCard.tsx` | Edit -- "View Coach Notes" styling |
| `src/components/home/CurrentFocusCard.tsx` | Edit -- fetch and display `learner_note` |
| `src/lib/reviewPayload.ts` | No changes needed |

