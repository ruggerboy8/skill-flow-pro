

# Baseline Wizard UX Polish + Bug Fixes

11 items addressing note button visibility, onboarding tutorial, color/domain theming, autofocus, scroll behavior, reflection page redesign, post-submission flow, and the transcription bug.

---

## 1. Move Note Button to Left + Circle Treatment

**File:** `src/components/doctor/DomainAssessmentStep.tsx`

Move the `MessageSquare` button from after the pro move text to before it (left side). Give it a visible circular border (like the score buttons):
- `w-7 h-7 rounded-full border border-muted-foreground/30 flex items-center justify-center`
- When `hasNote`: filled style (e.g., `bg-primary/10 border-primary text-primary`)
- Layout becomes: `[note-btn] [pro move text] [1] [2] [3] [4]`

---

## 2. Progressive Tutorial Overlay (First Load)

**File:** `src/components/doctor/BaselineTutorial.tsx` (new)
**File:** `src/pages/doctor/BaselineWizard.tsx` (modified)

Build a step-by-step tooltip tutorial that fires once on the first domain load. Use localStorage key `baseline-tutorial-seen` to show only once.

Steps (4 total, each highlights a specific element):
1. **Score buttons** -- "You'll rate yourself on each Pro Move using these numbers. 1 = Needs focus, 4 = Exceptional."
2. **Pro Move text** -- "Tap any Pro Move to see more information about it." (pulsing border highlight)
3. **Materials sheet** -- Auto-open the sheet for the first pro move, overlay says: "This is the learning materials drawer -- you'll find details and examples here." User dismisses, sheet closes.
4. **Note button** -- "If you have a question, comment, or thought about a Pro Move, jot it down here as you go."

Implementation approach:
- A simple state machine component with `currentStep` (0-4, 0 = not started).
- Each step renders a fixed/absolute tooltip near the target element (use `ref` forwarding or element IDs).
- Semi-transparent backdrop behind the tooltip, highlighted element gets `z-50 relative`.
- "Next" / "Got it" button advances steps. "Skip" link available on every step.
- On completion or skip, set `localStorage.setItem('baseline-tutorial-seen', 'true')`.

---

## 3. Score Button Colors (Domain-Aware)

**File:** `src/components/doctor/DomainAssessmentStep.tsx`

Replace the monochrome `bg-primary` selected state with semantic colors matching the established scale:

| Score | Selected Color | Classes |
|-------|---------------|---------|
| 1 | Amber | `bg-amber-100 border-amber-400 text-amber-800` |
| 2 | Orange | `bg-orange-100 border-orange-400 text-orange-800` |
| 3 | Blue | `bg-blue-100 border-blue-400 text-blue-800` |
| 4 | Emerald | `bg-emerald-100 border-emerald-400 text-emerald-800` |

This matches the `NumberScale.tsx` color scheme already used elsewhere.

Additionally, apply the domain's `color_hex` as a subtle tint on the card header background:
- `style={{ backgroundColor: \`${domain.color_hex}15\` }}` (15 = ~8% opacity hex suffix)

Update the legend key to show colored dots matching these score colors instead of plain text.

---

## 4. Domain Color on Card Header

**File:** `src/components/doctor/DomainAssessmentStep.tsx`

- Card header gets a light background tint from `domain.color_hex` (8-10% opacity).
- The small circle indicator already uses the color; make it slightly larger (`w-5 h-5`).
- Domain name uses `font-bold` and slightly larger text.

---

## 5. Note Button Auto-Focus Textarea

**File:** `src/components/doctor/DomainAssessmentStep.tsx`

When expanding a note:
- Add a `ref` to each textarea using a ref map (`noteRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})`).
- After setting `expandedNoteId`, use `requestAnimationFrame` to call `.focus()` on the textarea for that action_id.

---

## 6. "Next Domain" Scrolls to Top

**File:** `src/pages/doctor/BaselineWizard.tsx`

In `handleNextDomain` and `handlePrevDomain`, add:
```ts
window.scrollTo({ top: 0, behavior: 'smooth' });
```

---

## 7. Rephrase All Instructions as Personal Notes from Dr. Alex

**File:** `src/components/doctor/BaselineWelcome.tsx`

Replace the generic bullet points with a personal message from Alex:

> "Hey {staffName}, I'm excited to go through this with you.
>
> Here's how this works: you'll go through each of the Doctor Pro Moves and rate yourself on a simple 1-4 scale. This isn't a test -- it's a starting point for our conversation.
>
> Be honest about where you are today. That's what makes this useful."
>
> -- Dr. Alex

**File:** `src/components/doctor/DomainAssessmentStep.tsx`

Update the legend card text to feel personal:
> "Rate yourself on each one. Remember: 4 means 'I do this even on my worst day.' Be real -- that's what makes this useful."

---

## 8. Reflection Page Redesign

**File:** `src/components/doctor/BaselineComplete.tsx`

Major restructure -- split into two distinct screens:

**Screen A: Reflection (shown first when `currentStep === 'complete'` and no reflection submitted)**
- Full-page card, no "optional" label
- Personal message from Alex at top:
  > "Before we wrap up, I'd love to hear what this was like for you. A few sentences is great -- just whatever comes to mind."
- Guiding prompts shown as soft italic text
- Type/Record tabs (same as now but cleaner)
- "Submit" button at bottom
- Small "Skip" text link below the button (advances to Screen B without saving)

**Screen B: What Happens Next (shown after reflection submit or skip)**
- Success checkmark + "Baseline Complete!"
- "What happens next" card with Alex's personal message
- "Go to Home" button
- If reflection was submitted, show it in a collapsed section below

---

## 9. Fix Transcription Bug

**File:** `src/components/doctor/BaselineComplete.tsx`

The `handleRecordingComplete` function sends the audio as form field `file`:
```ts
formData.append('file', audioBlob, 'reflection.webm');
```

But `transcribe-audio/index.ts` reads field `audio`:
```ts
const audioFile = formData.get('audio') as File;
```

Fix: change `'file'` to `'audio'`:
```ts
formData.append('audio', audioBlob, 'reflection.webm');
```

---

## 10. Post-Submission Flow (item 10 from PRD)

Already addressed in item 8 above -- after submitting reflection (or skipping), the user lands on the "What happens next" screen with the success state and "Go to Home" button.

---

## 11. Implementation Order

1. Fix transcription bug (1 line, immediate)
2. Score button colors + domain tinting (DomainAssessmentStep)
3. Note button repositioning + circle + autofocus
4. Scroll-to-top on domain change
5. Rephrase instructions (BaselineWelcome + DomainAssessmentStep legend)
6. Reflection page redesign (BaselineComplete split into reflection-first flow)
7. Tutorial overlay (new component + BaselineWizard integration)

---

## Technical Notes

- **Tutorial component**: Uses `position: fixed` overlay with a transparent cutout over the highlighted element. Each step uses a ref or `document.getElementById` to position the tooltip. No external library needed -- a simple ~150-line component.
- **Score colors**: Reuse the exact color mapping from `NumberScale.tsx` (`getSemanticColor` function) to keep consistency.
- **Domain tint**: Use inline `style` with hex color + alpha suffix rather than Tailwind classes, since domain colors are dynamic from DB.
- **Reflection flow**: The `BaselineComplete` component gets a new internal state `phase: 'reflection' | 'done'` to manage the two screens. "Skip" sets phase to `'done'` without saving.

