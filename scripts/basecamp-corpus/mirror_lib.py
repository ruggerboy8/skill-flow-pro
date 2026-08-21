"""Pure logic for ASK-5: mirroring active pro moves into corpus_documents.

Everything here is side-effect free and runnable without a database or
network access, so it is unit-tested directly (see test_mirror_lib.py). The
DB-touching entry point is mirror_pro_moves.py.

See docs/specs/ask-5-pro-moves-corpus-mirror.md for the approved design
(Option A: one corpus doc per active pro move, resource bodies inlined as
titled sections, mirror rows land as `canon` directly, refresh via a local
`framework_history` watermark).
"""

from __future__ import annotations

import hashlib
import json
from typing import Optional

# Idempotency key prefix (spec: source_item_id = 'promove:<action_id>').
MIRROR_ID_PREFIX = "promove:"

# Expert area mapping by role name (spec Decision 2: "map by role in the
# mirror script config ... adjustable as a small dict"). Covers every role
# with at least one active pro move as of 2026-08-21 (Doctor, Front Desk,
# Dental Assistant, Office Manager, Lead Dental Assistant -- US and UK role
# rows share these role_names). Lead Dental Assistant is not named in the
# spec; mapped alongside Dental Assistant as the closest fit (both are
# RDA-practice content) -- called out as a deviation in the PR body. A role
# with active pro moves but no entry here gets expert_area_id = None and a
# printed warning, rather than a guess.
EXPERT_AREA_BY_ROLE: dict[str, str] = {
    "Doctor": "clinical",
    "Front Desk": "operations",
    "Office Manager": "operations",
    "Dental Assistant": "RDA practice",
    "Lead Dental Assistant": "RDA practice",
}

# Resource types with markdown bodies, and the doctor-guidance subsection
# label each renders under. Order matches the spec's sample doc.
DOCTOR_RESOURCE_SECTIONS: list[tuple[str, str]] = [
    ("doctor_why", "Why"),
    ("doctor_good_looks_like", "What good looks like"),
    ("doctor_gut_check", "Gut check"),
    ("doctor_script", "Script"),
]

# Body-less resource types (URL/audio only) get a one-line mention instead
# of an inlined section. Order matches likely relevance (audio is by far
# the most common).
MENTION_ONLY_TYPES: list[tuple[str, str]] = [
    ("audio", "Audio"),
    ("video", "Video"),
    ("link", "Link"),
]

# Fields compared to decide whether a mirror row's content actually changed.
# Deliberately excludes `status`: reactivation (rejected -> canon on an
# unretired move) must trigger an update even when these fields are
# byte-identical to the last render, so status is checked separately.
HASH_FIELDS = ("title", "body", "source_url", "posted_at", "expert_area_id")


def mirror_source_item_id(action_id: int) -> str:
    return f"{MIRROR_ID_PREFIX}{action_id}"


def expert_area_name_for_role(role_name: str) -> Optional[str]:
    """Which corpus_expert_areas.area_name a role's pro moves belong to, or
    None if the role has no mapping (caller should warn, not guess)."""
    return EXPERT_AREA_BY_ROLE.get(role_name)


def _find_resource(resources: list[dict], resource_type: str) -> Optional[dict]:
    for r in resources:
        if r.get("type") == resource_type:
            return r
    return None


def render_title(role_name: str, action_statement: str) -> str:
    return f"{role_name} pro move: {(action_statement or '').strip()}"


def render_body(role_name: str, domain_name: str, competency_name: str,
                 description: Optional[str], intervention_text: Optional[str],
                 resources: list[dict]) -> str:
    """Render the doc body: header line + sections, each OMITTED when its
    source content is absent (no placeholder text) rather than shown empty.

    `resources` is the move's own active pro_move_resources rows (each a
    dict with at least `type`, `title`, `content_md`).
    """
    parts = [f"Role: {role_name} | Domain: {domain_name} | Competency: {competency_name}"]

    description = (description or "").strip()
    if description:
        parts.append(f"## Why it matters\n\n{description}")

    intervention_text = (intervention_text or "").strip()
    if intervention_text:
        parts.append(f"## Coaching nudge\n\n{intervention_text}")

    script = _find_resource(resources, "script")
    if script and (script.get("content_md") or "").strip():
        title = (script.get("title") or "").strip()
        heading = f"## Script: {title}" if title else "## Script"
        parts.append(f"{heading}\n\n{script['content_md'].strip()}")

    doctor_sections = []
    for resource_type, label in DOCTOR_RESOURCE_SECTIONS:
        r = _find_resource(resources, resource_type)
        if r and (r.get("content_md") or "").strip():
            doctor_sections.append(f"### {label}\n\n{r['content_md'].strip()}")
    if doctor_sections:
        parts.append("## Doctor guidance\n\n" + "\n\n".join(doctor_sections))

    mentions = []
    for resource_type, label in MENTION_ONLY_TYPES:
        for r in resources:
            if r.get("type") != resource_type:
                continue
            title = (r.get("title") or "").strip() or label
            mentions.append(f'{label}: "{title}"')
    if mentions:
        parts.append(f"Also on this pro move in the app: {'; '.join(mentions)}.")

    return "\n\n".join(parts)


def render_pro_move_document(move: dict, resources: list[dict],
                              expert_area_id_by_role: dict[str, Optional[str]]) -> dict:
    """Render one active pro move + its resources into a corpus_documents-
    shaped dict (everything except `id`/`org_id`, which the caller adds).

    `move` must have: action_id, action_statement, description,
    intervention_text, competency_id, competency_name, domain_name,
    role_name, updated_at.
    `expert_area_id_by_role`: role_name -> corpus_expert_areas.id (or None).
    """
    return {
        "title": render_title(move["role_name"], move["action_statement"]),
        "body": render_body(
            move["role_name"], move["domain_name"], move["competency_name"],
            move.get("description"), move.get("intervention_text"), resources),
        "source_kind": "authored",
        "source_item_id": mirror_source_item_id(move["action_id"]),
        "source_url": f"/my-role/area/{move['competency_id']}?move={move['action_id']}",
        "status": "canon",
        "posted_at": move.get("updated_at"),
        "stale_risk": False,
        "expert_area_id": expert_area_id_by_role.get(move["role_name"]),
    }


def mirror_content_hash(doc: dict) -> str:
    """Content fingerprint used to decide whether a mirror row needs
    rewriting. Field-order independent; NOT a security hash, just a cheap
    diff key."""
    payload = {k: doc.get(k) for k in HASH_FIELDS}
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def plan_mirror_upserts(rendered_docs: list[dict], existing_docs: list[dict]) -> dict:
    """Diff freshly rendered docs (one per active pro move) against the
    mirror rows currently in corpus_documents.

    `existing_docs`: corpus_documents rows for this org (any status/
    source_kind is safe to pass in -- only rows whose source_item_id starts
    with 'promove:' are considered; anything else, e.g. Basecamp rows, is
    ignored defensively so a caller can't accidentally touch them).

    Returns {"insert": [...], "update": [...], "retire": [...]}.
    - insert: rendered docs with no existing mirror row.
    - update: rendered docs whose existing row's content hash differs, OR
      whose status isn't 'canon' (reactivation of a previously retired move).
      Each carries the existing row's `id` alongside the rendered fields.
    - retire: existing mirror rows whose pro move is no longer active/
      rendered (retired) and isn't already 'rejected' -- {"id", "source_item_id"}.
    """
    existing_by_item = {
        d["source_item_id"]: d for d in existing_docs
        if (d.get("source_item_id") or "").startswith(MIRROR_ID_PREFIX)
    }

    rendered_ids: set[str] = set()
    to_insert: list[dict] = []
    to_update: list[dict] = []
    for doc in rendered_docs:
        item_id = doc["source_item_id"]
        rendered_ids.add(item_id)
        current = existing_by_item.get(item_id)
        if current is None:
            to_insert.append(doc)
            continue
        needs_update = (current.get("status") != "canon"
                         or mirror_content_hash(current) != mirror_content_hash(doc))
        if needs_update:
            to_update.append({**doc, "id": current["id"]})

    to_retire = [
        {"id": d["id"], "source_item_id": item_id}
        for item_id, d in existing_by_item.items()
        if item_id not in rendered_ids and d.get("status") != "rejected"
    ]

    return {"insert": to_insert, "update": to_update, "retire": to_retire}


def doc_size_chars(doc: dict) -> int:
    return len(doc.get("title") or "") + len(doc.get("body") or "")


def size_distribution(rendered_docs: list[dict]) -> dict:
    """Char-size stats over a set of rendered docs (title + body length)."""
    sizes = sorted(doc_size_chars(d) for d in rendered_docs)
    n = len(sizes)
    if n == 0:
        return {"count": 0, "min": 0, "max": 0, "mean": 0.0, "median": 0}
    mean = round(sum(sizes) / n, 1)
    mid = n // 2
    median = sizes[mid] if n % 2 == 1 else (sizes[mid - 1] + sizes[mid]) / 2
    return {"count": n, "min": sizes[0], "max": sizes[-1], "mean": mean, "median": median}


def should_short_circuit(current_watermark: Optional[int], stored_state: Optional[dict],
                          dry_run: bool) -> bool:
    """Can this run skip all further work (the one-query watermark check)?

    `stored_state`: {"watermark": int, "source": "dry"|"real"} from the last
    run that reached this point, or None if there's no local state yet
    (first run ever, or the state file was deleted/never committed --
    it's gitignored local bookkeeping, not synced state).

    A DRY run may trust a watermark recorded by either a prior dry or real
    run -- it never writes anything, so the worst case of a stale watermark
    is an out-of-date preview, not a missed sync.

    A REAL (write) run must never trust a watermark recorded by a mere
    dry-run preview: a dry run proves nothing about whether corpus_documents
    is actually in sync. A real run only short-circuits against a watermark
    that a prior REAL run itself confirmed, which is the only case where
    "nothing changed since we last looked" also means "and last time we
    looked, we actually wrote the result."
    """
    if stored_state is None or current_watermark is None:
        return False
    if stored_state.get("watermark") != current_watermark:
        return False
    if dry_run:
        return True
    return stored_state.get("source") == "real"
