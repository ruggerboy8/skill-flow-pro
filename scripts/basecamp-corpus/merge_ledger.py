#!/usr/bin/env python3
"""Stage D: merge candidates.csv with the classification JSONLs into the
sorting ledger (data/basecamp/ledger.csv), ready for Google Sheets.

Row order: keeps first, then maybes, then skips; within each, by project
and date. First two columns are blank for John's decision + notes.
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"

REC_ORDER = {"keep": 0, "maybe": 1, "skip": 2}


def main():
    classified = {}
    for jf in sorted((ROOT / "classified").glob("*.jsonl")):
        for line in jf.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            classified[(obj["project"], str(obj["item_id"]))] = obj

    rows = list(csv.DictReader(open(ROOT / "candidates.csv", encoding="utf-8")))
    missing = []
    merged = []
    for r in rows:
        c = classified.get((r["project"], r["item_id"]))
        if c is None:
            missing.append(f"{r['project']}/{r['item_id']} {r['title'][:50]}")
            c = {"recommendation": "maybe", "tier": "", "audience": "",
                 "suggested_owner": "", "topics": [], "summary": "(not classified)",
                 "reason": "classifier missed this row"}
        merged.append({
            "decision": "",
            "notes": "",
            "recommendation": c["recommendation"],
            "title": r["title"],
            "summary": c["summary"],
            "reason": c["reason"],
            "kind": r["kind"],
            "project": r["project"],
            "audience": c["audience"],
            "tier": c["tier"],
            "suggested_owner": c["suggested_owner"],
            "topics": ", ".join(c["topics"]) if isinstance(c["topics"], list) else c["topics"],
            "author": r["author"],
            "posted": r["posted_at"][:10],
            "voice": r["voice"],
            "vitals": r["vitals"],
            "copies": r["copies"],
            "comments": r["comment_count"],
            "open": f'=HYPERLINK("{r["basecamp_url"]}","Open in Basecamp")',
            "url": r["basecamp_url"],
            "item_id": r["item_id"],
        })

    merged.sort(key=lambda m: (REC_ORDER.get(m["recommendation"], 1),
                               m["project"], m["posted"]))

    out = ROOT / "ledger.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(merged[0].keys()))
        w.writeheader()
        w.writerows(merged)

    from collections import Counter
    recs = Counter(m["recommendation"] for m in merged)
    print(f"{len(merged)} rows -> {out}")
    print("recommendations:", dict(recs))
    if missing:
        print(f"\nWARNING {len(missing)} unclassified rows (defaulted to maybe):")
        for m in missing[:20]:
            print("  ", m)


if __name__ == "__main__":
    main()
