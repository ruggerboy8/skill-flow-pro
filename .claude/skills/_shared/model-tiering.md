# Model tiering for the kit

The orchestrator (the session you type into) runs **Fable 5**, set via `"model"`
in `.claude/settings.json`. Subagents are pinned by agent definition, because the
Agent tool's `model` parameter only accepts tier aliases (`opus`, `sonnet`,
`haiku`, `fable`) and `opus` resolves to Opus 5, which is not what this project
wants.

| Agent | Model | Use for |
|---|---|---|
| `kit-reviewer` | `claude-opus-4-8` | security review, audits, spec research, anything where a miss is expensive |
| `kit-builder` | `claude-sonnet-5` | implementing an approved spec on a branch |
| `kit-qa` | `claude-sonnet-5` | fresh-eyes QA, acceptance walks, adversarial testing |
| `kit-scout` | `claude-haiku-4-5-20251001` | mechanical sweeps: grep, count, inventory, dead-code detection |

Spawn them by name: `Agent(subagent_type: "kit-builder", ...)`. Do **not** pass a
`model` override alongside, because the override wins over the frontmatter and
would silently undo the pin.

## Two things that will bite you

**Agent definitions load at session start.** Editing a file in `.claude/agents/`
mid-session has no effect, and the agent will not appear in the available list.
Restart Claude Code after adding or changing one.

**Verify the pin took.** Run `/agents` and confirm each `kit-*` agent shows its
intended model. A model name that fails to resolve falls back rather than
erroring, so a typo is silent.

## Fallback

`.claude/settings.json` sets `fallbackModel` to Opus 4.8 then Sonnet 5, used only
when the primary model is overloaded or unavailable. It is not a routing rule.
