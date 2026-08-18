# Working in the CLI: Tricks of the Trade

**Status:** v1, 2026-08-18. Written for John as he moves to Warp + Claude
Code as his primary surface (see `docs/dev-workflow-redesign.md` and
`docs/dev-workflow-kit-instructions.md`). This is a living cheat sheet,
not a curriculum — add to it as new habits earn their place. A polished
reference version is published as a Claude artifact; this file is the
source of truth and the thing that stays in the repo.

Referenced in `CLAUDE.md` → "Who you're working with": any session
should reinforce these habits, not assume John already has them.

---

## Starting and resuming work

- `cd` into the repo, then `claude`. That's the whole ritual.
- **Don't start a brand-new conversation for work you were already doing.**
  If you closed the terminal or it's a new day but you're picking up the
  same thread, use `claude --continue` (or `claude --resume` to pick from
  a list of recent sessions) instead of `claude`. Starting fresh loses
  everything Claude remembers about what you were mid-way through.
- **One feature, one session.** Open a new Warp tab for unrelated work
  rather than steering one conversation through two different things —
  it's easier for both of you to reason about, and it matches the
  ticket-sized chunks the workflow kit is built around.

## The habits that keep you safe

- **Use plan mode before anything that isn't tiny.** `shift+tab` cycles
  Claude's mode; plan mode makes it think out loud and show you the plan
  *before* touching a single file. This is Gate 1 from the workflow
  redesign, built directly into the tool — you don't have to remember to
  ask for a plan, you just have to not skip this step.
- **Interrupting is always safe.** `Esc` stops Claude mid-action. It will
  not leave things half-broken by being stopped — worst case, redirect it
  or ask it to finish cleanly. Don't let a "wait, that's not what I
  meant" moment run to completion out of politeness.
- **There's a safety net before git even enters the picture.** Claude
  Code tracks the file edits it makes within a session, so if something
  looks wrong, just ask "undo that last change" or "put that file back
  the way it was" before you even think about branches or commits. Git
  history is the second net, not the first.
- **Nothing should reach `main` without you seeing a PR first**, once the
  workflow kit's guard hook is in place. If you're ever unsure whether
  that happened, just ask: "did that just go straight to main?"

## How to talk to Claude for the best results

This is the part where your actual strength (product thinking, describing
behavior, naming edge cases) *is* the skill — you don't need to learn a
new way of talking, you need to keep doing what you already do.

- **Describe the outcome, not the implementation.** "I want coaches to be
  able to flag a favorite move" is a better prompt than trying to name
  the component or the table. That's the job split working as intended.
- **Name the "who."** This week's lead-account bug (duplicate blank
  competencies) existed because it only showed up for one persona. When
  you ask for something, or when you're about to test it, say *which*
  account/role/screen matters — "check this as a lead," "check this as a
  brand-new hire with no evaluation yet."
- **Ask for the plain-English version, out loud, as a standing habit.**
  "Explain what you just did like I don't read code" is a completely
  normal thing to ask after any change, not an admission of anything.
- **Say so the moment a plan feels off**, before you approve it.
  Steering a plan costs one sentence; steering a finished build costs a
  redo.

## The handful of commands worth actually knowing

Deliberately short — these are the ones that pay for themselves:

- `/model` — see or switch which Claude model you're talking to.
- `/clear` — wipe the current conversation and start clean in this repo
  (use when you're truly starting something new, not resuming).
- `/help` — lists everything else, so you never have to memorize the
  full set.
- `/permissions` — see (and adjust) what Claude is allowed to do without
  asking you first.
- `/doctor` — self-diagnoses the Claude Code tool itself, not your
  project (this is what fixed the auto-update issue).
- `/init` — regenerates `CLAUDE.md` from the current codebase, useful if
  the project's own docs feel stale.

## Cutting down on "may I do this?" fatigue

Claude Code asks permission before actions it's not sure are safe. That's
correct behavior, but it gets old fast for the same handful of harmless,
repeated things (reading files, running a build). There's a built-in fix:
periodically run the **`/fewer-permission-prompts`** skill — it looks back
at recent sessions, finds the read-only actions you keep approving, and
adds them to an allowlist so you stop being asked. Worth running every
few weeks, not just once.

## Long tasks: don't watch the spinner

If something is going to take a while (a big build, a multi-file sweep),
ask Claude to run it in the background and let you know when it's done,
rather than sitting there watching output scroll. You'll get a
notification and can keep working or step away.

## Verifying without reading code

This is the one habit *not* to build: reading diffs to decide if
something's right. That was never the plan. The real verification loop
stays exactly what it's been —

- for anything visual or data-shaped: the Lovable branch preview, walked
  as the right persona, per the acceptance script Claude writes for you
- for everything else: ask Claude for the QA report in plain language,
  and specifically ask what it could **not** verify (its honesty on this
  point this week — "pass by code inspection, not verifiable live" — is
  exactly the signal to trust and act on, not a red flag)

## When the terminal looks broken or confusing

Don't try to decode an error message yourself. Paste the whole thing back
and ask "what does this mean, and what should I do." That's a completely
normal use of the tool, not a fallback for when you're stuck — it's
usually the fastest path either way.
