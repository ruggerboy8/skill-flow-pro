#!/usr/bin/env python3
"""ASK-1: import the Basecamp sorting ledger into corpus_documents.

Reads data/basecamp/ledger-full.csv plus the extracted text in
data/basecamp/text/<project>/<item_id>.txt and imports every keep/maybe
row as an `unreviewed` corpus document. Videos are deferred (no transcripts
yet); items with no extracted body (PDFs, this phase) import title + link
only.

Idempotent on source_item_id:
  - new items are inserted (status lands as the column default, 'unreviewed')
  - existing items get their CONTENT fields updated; status / reviewed_by /
    expert_area_id are never touched by this script, so re-running can never
    clobber curation state.

Usage:
  python3 scripts/basecamp-corpus/ingest_corpus.py [--dry-run]
      [--ledger data/basecamp/ledger-full.csv] [--text-dir data/basecamp/text]

Requires scripts/basecamp-corpus/.env (see README.md).
"""

from __future__ import annotations

import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from corpus_lib import (  # noqa: E402
    ALCAN_ORG_ID, classify_row, parse_extracted_text, row_to_document,
)
from db import get_client  # noqa: E402

# Fields the ingest owns and may refresh on re-run. Curation fields
# (status, expert_area_id, reviewed_by, reviewed_at) are never in this list.
CONTENT_FIELDS = [
    "title", "body", "summary", "tier", "audience", "source_kind",
    "source_url", "posted_at", "stale_risk", "location_scope",
]

INSERT_BATCH = 200


def load_documents(ledger_path: str, text_dir: str) -> tuple[list[dict], dict[str, int]]:
    """Build the list of documents to import, plus skip/shape counters."""
    docs: list[dict] = []
    counters = {"total": 0, "imported": 0, "skipped": 0, "no_body": 0}
    with open(ledger_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            counters["total"] += 1
            ok, _reason = classify_row(row)
            if not ok:
                counters["skipped"] += 1
                continue
            text_path = os.path.join(text_dir, row["project"], f"{row['item_id']}.txt")
            body = None
            if os.path.exists(text_path):
                with open(text_path, encoding="utf-8") as tf:
                    body = parse_extracted_text(tf.read())
            if body is None:
                counters["no_body"] += 1
            docs.append(row_to_document(row, body))
            counters["imported"] += 1
    return docs, counters


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", default="data/basecamp/ledger-full.csv")
    parser.add_argument("--text-dir", default="data/basecamp/text")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change without writing")
    args = parser.parse_args()

    docs, counters = load_documents(args.ledger, args.text_dir)
    ids = [d["source_item_id"] for d in docs]
    if len(ids) != len(set(ids)):
        sys.exit("Duplicate item_id values in the ledger — fix the ledger first.")

    print(f"Ledger rows: {counters['total']}  "
          f"importable: {counters['imported']}  "
          f"skipped (skip/blank/video): {counters['skipped']}  "
          f"title+link only (no body): {counters['no_body']}")

    # Idempotency is keyed on the composite (org_id, source_item_id); this
    # script only ever works within the Alcan org, so scope every read/write
    # to it and match the DB's unique constraint.
    client = get_client()
    existing_rows = client.select_all(
        "corpus_documents", "source_item_id",
        filters={"org_id": ALCAN_ORG_ID}, page_size=1000)
    existing = {r["source_item_id"] for r in existing_rows if r["source_item_id"]}

    to_insert = [d for d in docs if d["source_item_id"] not in existing]
    to_update = [d for d in docs if d["source_item_id"] in existing]
    print(f"Existing corpus rows: {len(existing)}  "
          f"will insert: {len(to_insert)}  will update: {len(to_update)}")

    if args.dry_run:
        print("Dry run — no writes performed.")
        return

    for i in range(0, len(to_insert), INSERT_BATCH):
        client.insert("corpus_documents", to_insert[i:i + INSERT_BATCH])
        print(f"  inserted {min(i + INSERT_BATCH, len(to_insert))}/{len(to_insert)}")

    for i, doc in enumerate(to_update, 1):
        patch = {k: doc[k] for k in CONTENT_FIELDS}
        client.update_by_item_id(
            "corpus_documents", ALCAN_ORG_ID, doc["source_item_id"], patch)
        if i % 100 == 0 or i == len(to_update):
            print(f"  updated {i}/{len(to_update)}")

    # Self-check: every importable ledger item must now exist exactly once
    # within the org.
    after = client.select_all(
        "corpus_documents", "source_item_id",
        filters={"org_id": ALCAN_ORG_ID}, page_size=1000)
    have = [r["source_item_id"] for r in after if r["source_item_id"]]
    if len(have) != len(set(have)):
        sys.exit("SELF-CHECK FAILED: duplicate source_item_id rows in corpus_documents.")
    missing = set(ids) - set(have)
    if missing:
        sys.exit(f"SELF-CHECK FAILED: {len(missing)} ledger items missing after ingest.")
    print(f"Done. corpus_documents now holds {len(have)} basecamp-sourced rows; "
          "re-running is a no-op apart from content refreshes.")


if __name__ == "__main__":
    main()
