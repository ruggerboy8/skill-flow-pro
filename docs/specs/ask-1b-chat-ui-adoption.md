# ASK-1b: Rebuild /ask presentation on standard chat components

**Status:** approved for build 2026-08-21 (John, in-session)
**Depends on:** ASK-1 (merged, live), PR #81 (merged)

## Why

The hand-rolled chat pane keeps accumulating solved-problem bugs (title
truncation, hidden delete affordance, scroll behavior, no mobile conversation
UI). Chat UI is a commodity; we should own the data layer, not the widgets.
John's direction 2026-08-21: "source an out-of-the-box chat interface or
compare our implementation with documented standards instead of building the
whole thing from scratch."

## What

Rebuild the presentation layer of `src/pages/ask/AskPage.tsx` on **AI
Elements** (Vercel's shadcn-idiom chat components: Conversation, Message,
PromptInput, Sources, etc.), copied into `src/components/` like our other
shadcn components so Lovable can read and edit them.

**Unchanged, by contract:**
- `useAskAlcanChat.ts` data hooks (conversations, messages, mutations,
  cited docs) — adapt call sites only, keep the hook API.
- The `ask-alcan` edge function and its FROZEN `{ answer, citations }`
  response shape (ASK-2 additivity guarantee).
- The consent model: asker-only conversations, no admin read path.
- Super-admin gate and self-redirect.

**Must carry over from PR #81 (do not regress):**
- Delete conversation w/ confirm; ghost-conversation cleanup on failed
  first send
- Pending bubble keyed to conversation + message count (repeat questions,
  mid-ask switching)
- Real server error surfacing (FunctionsHttpError.context)
- Privacy line, Alcan-voice microcopy, tappable example questions,
  "Checking our playbook…" state, markdown answers, Sources labels +
  fallback chip, aria/IME/reduced-motion fixes

**New in this ticket:**
- Mobile: conversation list as a drawer/sheet; `dvh`-based layout so the
  iOS keyboard doesn't hide the composer; Enter-to-send gated to non-touch
- Delete affordance always visible (not hover-only)
- Conversation titles truncate properly at every width
- Tap targets ≥ 44px on touch

## Acceptance

1. Phone viewport: can list, switch, create, and delete conversations;
   composer stays visible with keyboard open.
2. Desktop: no visual regression on the PR #81 feature list above.
3. A conversation with a 200-char title renders truncated everywhere.
4. `npm run check` green.

## Notes

- Mobile-shell footgun (memory): any mobile-only conditional must not
  depend on an async-initialized `useIsMobile` value.
- Citation visibility for non-super-admins stays deferred (pre-staff-
  rollout list), but don't make it harder.

## Research decision (2026-08-21, ASK-1b Lane B)

**Decision: AI Elements.** No disqualifier found; going with the spec's
default.

Checked against the three criteria:

1. **Vite (non-Next) compatibility.** AI Elements' display primitives
   (`Conversation`, `Message`/`MessageContent`, `PromptInput`, `Sources`)
   are plain props-driven React components with no Next.js-only APIs. Some
   files carry a `"use client"` directive, which is an inert string
   statement outside an RSC bundler (Vite/esbuild ignores it) — not a real
   Next.js requirement. The AI SDK's own docs note the streaming backend
   piece (which we don't use — we call our existing `ask-alcan` edge
   function) can run on non-Next platforms too.
2. **Component inventory vs. our needs.** `Conversation` gives us an
   auto-scrolling message pane with a "jump to bottom" affordance
   (replaces our hand-rolled `bottomRef` scroll effect) via the
   `use-stick-to-bottom` package. `Message`/`MessageContent` render a
   role-tagged bubble from plain `{role, content}` data — no `useChat`
   hook required. `PromptInput` is a controlled form component; its
   `onSubmit` handler works with our own submit logic untouched.
   `Sources`/`Source` render an anchor list from plain `{title, url}`
   data. Markdown rendering moves from `react-markdown` to `streamdown`
   (AI Elements' bundled renderer) — one swap, not a new capability gap.
   Neither library ships a conversation-list/sidebar component; that part
   stays hand-built regardless of library choice, which is what the
   spec's "New in this ticket" mobile-drawer work already assumes.
3. **Lovable-editability.** AI Elements installs as literal source files
   copied into `src/components/ai-elements/*` (same shadcn CLI pattern we
   already use for `src/components/ui/*`), fully readable and editable in
   Lovable. assistant-ui was the alternative considered per the spec's
   framing, but its core message/state model lives in the
   `@assistant-ui/react` npm package (only some pieces are copy-paste),
   and its documented backend contract expects a streaming endpoint
   (`streamText().toUIMessageStreamResponse()`). That's a real mismatch
   against our frozen `{ answer, citations }` JSON contract from
   `ask-alcan` (the ASK-2 additivity guarantee) — adopting it would mean
   building a fake-stream adapter around a single JSON response for no
   behavioral gain, and it fails the "code-in-repo beats package-locked"
   test worse than AI Elements does.

**New dependencies added:** `streamdown` (markdown renderer) and
`use-stick-to-bottom` (Conversation auto-scroll). Both are plain
client-side libraries, no server-side requirement, consistent with the
rest of the frontend dependency footprint.

**Not adopted:** assistant-ui, for the streaming-contract mismatch and
weaker code-in-repo story above.
