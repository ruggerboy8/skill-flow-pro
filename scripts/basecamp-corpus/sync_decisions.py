#!/usr/bin/env python3
"""ASK-1: apply John's Sheet decisions to corpus_documents statuses.

Reads an exported CSV of the sorting Sheet (any CSV with `item_id` and
`decision` columns works — the full ledger export qualifies) and updates
statuses: decision "keep" -> `kept`, "reject" -> `rejected`. Everything
else (blank, other values) is left alone. Run manually per batch.

Guardrails:
  - `canon` rows are never demoted — expert sign-off outranks the Sheet.
  - rows already at the target status are skipped (idempotent).
  - decisions for item_ids not in the corpus are reported, not invented.

Usage:
  python3 scripts/basecamp-corpus/sync_decisions.py <decisions.csv> [--dry-run]

Requires scripts/basecamp-corpus/.env (see README.md).
"""

from __future__ import annotations

import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from corpus_lib import ALCAN_ORG_ID, plan_decision_updates  # noqa: E402
from db import get_client  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decisions_csv", help="CSV with item_id + decision columns")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change without writing")
    args = parser.parse_args()

    with open(args.decisions_csv, newline="", encoding="utf-8") as f:
        sheet_rows = list(csv.DictReader(f))
    if sheet_rows and not {"item_id", "decision"} <= set(sheet_rows[0].keys()):
        sys.exit("CSV must have item_id and decision columns.")

    # Statuses are matched and written per-org (composite key
    # org_id + source_item_id); this script only handles the Alcan org.
    client = get_client()
    existing_rows = client.select_all(
        "corpus_documents", "source_item_id,status",
        filters={"org_id": ALCAN_ORG_ID}, page_size=1000)
    existing = {r["source_item_id"]: r["status"]
                for r in existing_rows if r["source_item_id"]}

    updates, skipped_canon, missing = plan_decision_updates(sheet_rows, existing)

    n_kept = sum(1 for s in updates.values() if s == "kept")
    n_rejected = sum(1 for s in updates.values() if s == "rejected")
    print(f"Sheet rows: {len(sheet_rows)}  updates: {len(updates)} "
          f"(kept: {n_kept}, rejected: {n_rejected})")
    if skipped_canon:
        print(f"  skipped {len(skipped_canon)} canon rows (never demoted by the Sheet)")
    if missing:
        print(f"  WARNING: {len(missing)} decided items not in the corpus "
              f"(run ingest first?): {missing[:5]}{'...' if len(missing) > 5 else ''}")

    if args.dry_run:
        print("Dry run — no writes performed.")
        return

    for i, (item_id, status) in enumerate(updates.items(), 1):
        client.update_by_item_id(
            "corpus_documents", ALCAN_ORG_ID, item_id, {"status": status})
        if i % 100 == 0 or i == len(updates):
            print(f"  updated {i}/{len(updates)}")
    print("Done.")


if __name__ == "__main__":
    main()
