# Skill Flow Pro — System Overview

*Last verified against the codebase and live schema: 2026-06-22.*
*This is the entry-point document. Read this first, then the [glossary](glossary.md),
[data model](data-model.md), and [architecture](architecture.md).*

---

## What this is

Skill Flow Pro (the app's UI brand is **ProMoves**) is a **coaching and skills-development
platform for dental practices**. It turns "getting better at your job" into a structured,
measurable weekly habit for every staff member in a practice, and gives coaches, managers,
and clinical leaders the tools to support and measure that growth.

It was originally built as an internal tool for a single pediatric dental organization
(**Alcan**) and is now being expanded into a **multi-tenant SaaS product** that can serve
many unrelated dental organizations — including UK general practices — each with their own
isolated data and configuration.

## Who uses it

| User | What they do |
|---|---|
| **Participant** (e.g. a dental assistant, front-desk staff) | Sees their assigned skills each week, rates their confidence at the start of the week and their actual performance at the end. |
| **Coach** | Supports a set of staff: reviews their submissions, runs evaluations, gives feedback. |
| **Office Manager** | A participant who also has visibility into their location's data. |
| **Regional / Org Admin** | Oversees multiple locations or a whole organization: dashboards, user management, library control. |
| **Doctor** | A dentist on a looser, clinical-director-facilitated development track (not the weekly cadence). |
| **Clinical Director** | Manages the development of one or more doctors. |
| **Super Admin / Platform Admin** | Skill Flow Pro staff with cross-organization control. |

See [architecture.md](architecture.md#roles--permissions) for exactly how these roles are
determined in code.

## The core idea: the weekly loop

The heart of the product is a repeating weekly cycle built around two moments:

1. **Check-In (start of week):** Each participant is shown the **Pro Moves** (specific,
   coachable behaviors) assigned to them this week and rates their **confidence** on each.
2. **Check-Out (end of week):** They rate their actual **performance** on those same Pro Moves.

The gap between confidence and performance — and the trend over time — is what coaches and
the participant work on. Deadlines are per-location (a "due day" and time for confidence and for
performance). *(Historically weeks were grouped into **cycles** of 6 weeks, a holdover from a
fixed 18-week onboarding curriculum. That cycle concept is now **legacy** — staff just join and
do the currently-assigned Pro Moves — though it's still wired into parts of the code. See
[glossary.md](glossary.md) and [improvement-backlog.md](improvement-backlog.md).)*

```
Pro Moves assigned  →  Confidence rated (check-in)  →  ...week happens...  →  Performance rated (check-out)
        ▲                                                                              │
        └──────────────── next week, next set of Pro Moves ◄──────────────────────────┘
```

Beyond the weekly loop, coaches run **evaluations** of staff, and the **sequencer** *recommends*
which Pro Moves might be worth assigning next (a Regional Manager reviews those recommendations
and **manually decides** what's actually assigned — the sequencer does not auto-assign).

## How the content is structured

The "what you're learning" is a four-level hierarchy:

```
Role (e.g. DFI, RDA, Office Manager)
  └── Domain (4 top-level skill areas)
        └── Competency (126 — specific skills)
              └── Pro Move (332 — concrete, observable behaviors — the atomic unit)
```

A **Pro Move** is the smallest unit: a single, specific behavior someone can practice and be
scored on. Everything in the weekly loop ultimately points at Pro Moves.

## How it's built (one-paragraph version)

A **Vite + React + TypeScript** single-page app (styled with Tailwind + shadcn/ui) talking to
a **Supabase** backend (Postgres database, Auth, Row-Level Security, and Edge Functions).
There is no separate custom server — the React app talks directly to Supabase, and security is
enforced in the database via Row-Level Security policies. AI features (transcription, insight
extraction, content formatting) run as Supabase Edge Functions. Full detail in
[architecture.md](architecture.md).

## Where things are going

The active program of work is the move from "single-org internal tool" to "multi-tenant SaaS":
organizations as isolated tenants, a platform-vs-organization Pro Move library, a flexible
capability-based permission model, and UK-readiness (timezones, GDPR). Much of the tenancy
schema is already in place. The design intent lives in
[enterprise-architecture.md](enterprise-architecture.md) and the live status/sequencing lives
in [roadmap.md](roadmap.md).

## Documentation map

| Doc | What it covers |
|---|---|
| **system-overview.md** (this file) | What the product is, who uses it, the core loop. |
| [glossary.md](glossary.md) | Definitions of every domain term (Pro Move, cycle, check-in, sequencer, …). |
| [data-model.md](data-model.md) | The current database: every table, grouped by purpose. |
| [architecture.md](architecture.md) | The codebase: structure, routing, auth, roles, edge functions. |
| [enterprise-architecture.md](enterprise-architecture.md) | Design intent for multi-tenancy & permissions. |
| [roadmap.md](roadmap.md) | Work queue, locked decisions, session log. |
| [improvement-backlog.md](improvement-backlog.md) | Known weirdness, legacy cleanup candidates, change-management practice. |
| [`/CLAUDE.md`](../CLAUDE.md) | Operational notes for AI assistants (Supabase connection, migration rules). |
