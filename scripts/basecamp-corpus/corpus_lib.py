"""Pure logic for the Basecamp corpus ingest (ASK-1).

Everything in this module is side-effect free and runnable without a
database, so it can be unit-tested directly (see test_corpus_lib.py).
The DB-touching entry points live in ingest_corpus.py / sync_decisions.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

# The Alcan organization (same constant as src/lib/askAlcanAccess.ts).
ALCAN_ORG_ID = "a1ca0000-0000-0000-0000-000000000001"

BODY_MARKER = "--- BODY ---"
NO_BODY_SENTINEL = "(no body text)"

# ledger `recommendation` values that enter the corpus as `unreviewed`.
IMPORT_RECOMMENDATIONS = {"keep", "maybe"}


def parse_extracted_text(raw: str) -> Optional[str]:
    """Return the body text from an extracted-text file, or None.

    Extracted files look like:

        TITLE: ...
        KIND: ...
        ...header lines...

        --- BODY ---
        actual body text

    Returns None when there is no body marker, the body is empty, or the
    body is the "(no body text)" sentinel (e.g. PDFs whose text extraction
    is deferred — those import title + link only in this phase).
    """
    if BODY_MARKER not in raw:
        return None
    body = raw.split(BODY_MARKER, 1)[1].strip()
    if not body or body == NO_BODY_SENTINEL:
        return None
    return body


def classify_row(row: dict) -> tuple[bool, str]:
    """Decide whether a ledger row is imported. Returns (import?, reason).

    - Only recommendation keep/maybe enter the corpus.
    - Videos are deferred entirely (they wait for transcripts).
    """
    rec = (row.get("recommendation") or "").strip().lower()
    if rec not in IMPORT_RECOMMENDATIONS:
        return False, f"recommendation={rec or '(blank)'}"
    if (row.get("kind") or "").strip().lower() == "video":
        return False, "video (deferred until transcripts)"
    return True, "import"


def parse_posted_at(posted: str) -> Optional[str]:
    """Normalize the ledger `posted` value to an ISO-8601 UTC timestamp.

    Accepts `YYYY-MM-DD` or a full ISO timestamp; returns None when blank
    or unparseable rather than guessing.
    """
    posted = (posted or "").strip()
    if not posted:
        return None
    try:
        if len(posted) == 10:
            dt = datetime.strptime(posted, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(posted.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


def parse_tier(tier: str) -> Optional[int]:
    tier = (tier or "").strip()
    if tier in {"1", "2", "3"}:
        return int(tier)
    return None


def parse_stale_risk(value: str) -> bool:
    return (value or "").strip().lower() in {"yes", "true", "1", "y"}


def row_to_document(row: dict, body: Optional[str]) -> dict:
    """Map a ledger row + extracted body to a corpus_documents record.

    Status is NOT set here: inserts land as 'unreviewed' (the column
    default), and re-runs must never touch status — curation state
    belongs to sync_decisions.py and the future corpus manager.
    """
    return {
        "org_id": ALCAN_ORG_ID,
        "title": (row.get("title") or "").strip() or "(untitled)",
        "body": body,
        "summary": (row.get("summary") or "").strip() or None,
        "tier": parse_tier(row.get("tier", "")),
        "audience": (row.get("audience") or "").strip() or None,
        "source_kind": "basecamp",
        "source_url": (row.get("url") or "").strip() or None,
        "source_item_id": (row.get("item_id") or "").strip(),
        "posted_at": parse_posted_at(row.get("posted", "")),
        "stale_risk": parse_stale_risk(row.get("stale_risk", "")),
        "location_scope": (row.get("location_scope") or "").strip() or None,
    }


def normalize_decision(decision: str) -> Optional[str]:
    """Map a Sheet decision to a corpus status. Unknown/blank -> None."""
    decision = (decision or "").strip().lower()
    if decision == "keep":
        return "kept"
    if decision == "reject":
        return "rejected"
    return None


def plan_decision_updates(
    sheet_rows: list[dict], existing: dict[str, str]
) -> tuple[dict[str, str], list[str], list[str]]:
    """Compute status updates from Sheet rows against existing documents.

    `existing` maps source_item_id -> current status.
    Returns (updates {item_id: new_status}, skipped_canon, missing).

    - canon rows are never demoted by the Sheet (expert sign-off outranks it)
    - rows already at the target status are omitted (idempotent)
    - decisions for items not in the corpus are reported, not invented
    """
    updates: dict[str, str] = {}
    skipped_canon: list[str] = []
    missing: list[str] = []
    for row in sheet_rows:
        item_id = (row.get("item_id") or "").strip()
        target = normalize_decision(row.get("decision", ""))
        if not item_id or target is None:
            continue
        current = existing.get(item_id)
        if current is None:
            missing.append(item_id)
        elif current == "canon":
            skipped_canon.append(item_id)
        elif current != target:
            updates[item_id] = target
    return updates, skipped_canon, missing
