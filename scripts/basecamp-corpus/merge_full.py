#!/usr/bin/env python3
"""Build data/basecamp/ledger-full.csv: the complete unified sorting ledger.

Every candidate from all three exports, with the comment-revision pass
applied on top of the slice classifications. Supersedes ledger.csv and
ledger-addendum.csv as the thing John uploads to Google Sheets.
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"

REC_ORDER = {"keep": 0, "maybe": 1, "skip": 2}
LOCATION = {
    "sprout-dentistry-for-kids", "kids-tooth-team-michigan",
    "big-apple-pediatric-dentistry", "steiner-ranch-pediatric-dentistry",
    "manor-kids", "kids-tooth-team-pflugerville",
}
# multi-office brand spaces (KTT spans Buda/Kyle/etc.)
BRAND = {"kids-tooth-team", "kids-tooth-team-texas"}
ROLE = {"doctors", "rdas", "practice-managers", "director-of-first-impressions",
        "regional-managers"}


def space_type(project):
    if project in LOCATION:
        return "location"
    if project in BRAND:
        return "brand"
    if project in ROLE:
        return "role"
    if project == "adaa-assisting-school":
        return "school"
    return "company"


def load_jsonl(path):
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()
            if l.strip()]


def main():
    classified = {}
    for jf in sorted((ROOT / "classified").glob("*.jsonl")):
        if jf.name.startswith("revision-"):
            continue
        for o in load_jsonl(jf):
            classified[(o["project"], str(o["item_id"]))] = o

    revisions = {}
    for jf in sorted((ROOT / "classified").glob("revision-*.jsonl")):
        for o in load_jsonl(jf):
            revisions[(o["project"], str(o["item_id"]))] = o

    rows = list(csv.DictReader(open(ROOT / "candidates.csv", encoding="utf-8")))
    missing, merged = [], []

    for r in rows:
        key = (r["project"], r["item_id"])
        rev = revisions.get(key)
        c = rev or classified.get(key)
        if c is None:
            missing.append(f"{key} {r['title'][:50]}")
            c = {"recommendation": "maybe", "summary": "(not classified)",
                 "reason": "classifier missed this row", "topics": []}
        merged.append({
            "decision": "",
            "notes": "",
            "recommendation": c["recommendation"],
            "title": r["title"],
            "summary": c["summary"],
            "reason": c.get("reason", ""),
            "kind": r["kind"],
            "space_type": space_type(r["project"]),
            "project": r["project"],
            "audience": c.get("audience", ""),
            "tier": c.get("tier", ""),
            "suggested_owner": c.get("suggested_owner", ""),
            "location_scope": c.get("location_scope", ""),
            "stale_risk": c.get("stale_risk", ""),
            "topics": ", ".join(c["topics"]) if isinstance(c.get("topics"), list) else c.get("topics", ""),
            "author": r["author"],
            "posted": r["posted_at"][:10],
            "voice": r["voice"],
            "vitals": r["vitals"],
            "copies": r["copies"],
            "comments": r["comment_count"],
            "comment_informed": ("revised" if (rev and rev.get("changed")) else
                                 ("reviewed" if rev else "")),
            "change_note": (rev or {}).get("change_note", "") if (rev and rev.get("changed")) else "",
            "open": f'=HYPERLINK("{r["basecamp_url"]}","Open in Basecamp")',
            "url": r["basecamp_url"],
            "item_id": r["item_id"],
        })

    merged.sort(key=lambda m: (REC_ORDER.get(m["recommendation"], 1),
                               m["space_type"], m["project"], m["posted"]))

    out = ROOT / "ledger-full.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(merged[0].keys()))
        w.writeheader()
        w.writerows(merged)

    from collections import Counter
    print(f"{len(merged)} rows -> {out}")
    print("recommendations:", dict(Counter(m["recommendation"] for m in merged)))
    print("by space_type:", dict(Counter(m["space_type"] for m in merged)))
    flips = [m for m in merged if m["comment_informed"] == "revised"]
    print("comment-revised rows:", len(flips))
    print("stale_risk yes:", sum(1 for m in merged if m["stale_risk"] == "yes"))
    if missing:
        print(f"WARNING {len(missing)} unclassified:", *missing[:10], sep="\n  ")


if __name__ == "__main__":
    main()
