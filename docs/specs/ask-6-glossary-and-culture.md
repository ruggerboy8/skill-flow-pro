# ASK-6: House-vocabulary glossary + Culture Guide ingest

**Status: SHIPPED 2026-08-25 (applied to prod, live on `ask-alcan`).**

Two related pieces, both prompted by a real retrieval miss found in testing:
a question about what a "DFI" does on a first visit returned an X-ray-refusal
doc and missed every Front Desk pro move, because the pro-move docs say
"Front Desk" and never "DFI" (the term staff actually use).

## Part 1: the glossary (a reusable, org-agnostic shape)

### The idea

A per-org table of house vocabulary the assistant loads on every question and
uses to translate what staff *say* (DFI, RDA, OM, GA, nitrous) into the terms
the corpus actually *uses* (Front Desk, Dental Assistant, Office Manager,
General anesthesia, Nitrous oxide) before it searches. It also lets the
assistant define a term directly.

### The shape (org-agnostic — this is the part that ports to any org)

Table `corpus_glossary` (migration `20260825170000_ask6_corpus_glossary.sql`),
same gate and pattern as `corpus_expert_areas` (super-admin RLS, org-scoped):

| column | meaning |
|---|---|
| `org_id` | tenant scope |
| `term` | the canonical term as it appears in the corpus / how the org wants it said |
| `aliases` (text[]) | the words people actually say: acronyms, slang, common variants, frequent misspellings. This is what makes a search match |
| `category` | `role` \| `team` \| `program` \| `tool` \| `procedure` \| `place` \| `acronym` \| `value` \| `benefit` \| `other` |
| `definition` | one to three plain sentences |
| `maps_to` | optional: the expert area / canonical role a role-term belongs to (free text, portable) |
| `notes` | optional org-specific caveat, or a "confirm this" flag |
| `provenance` | where the entry's claim comes from: `corpus` (backed by docs), `domain_knowledge` (general, no Alcan source), `assumption` (unverified Alcan claim) — default `assumption` |
| `source_document_ids` (uuid[]) | the corpus docs that back the entry (representative, not exhaustive); empty for domain_knowledge / assumption |
| `unique (org_id, term)` | idempotent seeding |

### Provenance (added 20260825180000)

Every entry says where its claim came from, so a wrong entry is traceable and
the unbacked ones are visible. This exists because the first seed asserted
"Thinkific hosts Alcan training" from Claude's own inference; it is in fact
retired. Audit the risky ones directly:

```sql
select term, provenance, source_document_ids, notes
from corpus_glossary
where provenance = 'assumption';   -- the entries with NO source; verify these first
```

The assistant treats the glossary as a translation/disambiguation aid, **not**
a citable source: its prompt says never to present a glossary definition as an
established fact and to confirm substantive claims against retrieved documents.
So a stale glossary entry degrades search wording at worst, it does not put an
un-sourced claim into an answer.

**To onboard a new org:** seed `corpus_glossary` with that org's rows using the
same columns. Nothing else changes. The Alcan content lives separately in
`scripts/basecamp-corpus/seed_glossary_alcan.sql` (data, not infra), so it is a
clean template to copy.

### How the assistant uses it

`ask-alcan` loads the glossary alongside the expert areas and renders a "House
vocabulary" block into the system prompt (before the cache breakpoint, so
prompt caching still works — the block only changes when the glossary changes).
Rule 1 tells the model to translate house vocabulary into canonical terms
before it searches. Verified: searching the canonical "Front Desk ..." phrasing
returns all the right pro moves, where "DFI ..." returned none.

### Alcan seed (20 entries, authored 2026-08-25)

Roles (Front Desk/DFI, Dental Assistant/RDA, Lead DA, Office Manager/OM,
Doctor), org/brands (Alcan Dental Cooperative, Kids Tooth Team), core values
(Radical Candor, Extreme Ownership, Zero defect), tools (CareStack, Reach,
Thinkific), clinical procedures (GA, IV sedation, nitrous, SDF, radiographs,
frenectomy), and the membership plan. Three entries carry a `notes` "confirm
with operations" flag (Kids Tooth Team mapping, the after-hours vendor "Reach",
and the Thinkific/"Done Desk" relationship). The glossary is data: edit it in
the table any time; a re-seed uses `on conflict do nothing` and never clobbers
hand edits.

## Part 2: Culture Guide ingest

The Alcan Culture Guide (founder-authored, distinct from the employee handbook)
was split into 12 focused corpus docs (Our History + the 11 values), one per
section so a single value surfaces on its own ("what is radical candor",
"what's our safety culture"). Ingest: `scripts/basecamp-corpus/
ingest_culture_guide.py`. Rows are `source_kind='authored'`,
`source_item_id='culture-guide:<slug>'`, `status='canon'` (official, curated,
skips the review queue like the framework), embedded via the standard
`embed_corpus.py`. Verified retrievable in prod.

## Follow-ups

- Optional reinforcement: fold role aliases into the pro-move doc headers on
  the next mirror run (belt-and-suspenders, helps even if the model skips the
  translation step). Not required now that the glossary is live.
- Confirm the three flagged glossary entries with operations.
- The glossary is the natural place to grow as experts surface more house terms
  during the review sessions.
