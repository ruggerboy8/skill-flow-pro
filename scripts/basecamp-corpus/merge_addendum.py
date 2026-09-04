#!/usr/bin/env python3
"""Build data/basecamp/ledger-addendum.csv: rows to append to the Google
Sheet John already has.

Contents:
- every export-3 candidate (new spaces), with the comment-revision pass
  applied on top of the slice classifications
- plus any export-1/2 row whose verdict CHANGED once comments were read
  (status "revised", so John can find and update those rows in the sheet)

Shared columns match ledger.csv order exactly; new columns are appended at
the end so pasted rows still line up.
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"

REC_ORDER = {"keep": 0, "maybe": 1, "skip": 2}
LOCATION = {
    "sprout-dentistry-for-kids", "kids-tooth-team-texas", "kids-tooth-team-michigan",
    "big-apple-pediatric-dentistry", "steiner-ranch-pediatric-dentistry",
    "manor-kids", "kids-tooth-team-pflugerville",
}
ROLE = {"doctors", "rdas", "practice-managers", "director-of-first-impressions",
        "regional-managers"}


def space_type(project):
    if project in LOCATION:
        return "location"
    if project in ROLE:
        return "role"
    if project == "adaa-assisting-school":
        return "school"
    return "company"


def load_jsonl(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


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
    by_key = {(r["project"], r["item_id"]): r for r in rows}

    # titles duplicated from the company/role ledger, for the dup flag
    v12_titles = {r["title"].strip().lower() for r in rows if r["export"] != "export-3"}

    out_rows = []
    missing = []

    def build(r, c, status, change_note=""):
        return {
            "decision": "",
            "notes": "",
            "recommendation": c["recommendation"],
            "title": r["title"],
            "summary": c["summary"],
            "reason": c["reason"],
            "kind": r["kind"],
            "project": r["project"],
            "audience": c.get("audience", ""),
            "tier": c.get("tier", ""),
            "suggested_owner": c.get("suggested_owner", ""),
            "topics": ", ".join(c["topics"]) if isinstance(c.get("topics"), list) else c.get("topics", ""),
            "author": r["author"],
            "posted": r["posted_at"][:10],
            "voice": r["voice"],
            "vitals": r["vitals"],
            "copies": r["copies"],
            "comments": r["comment_count"],
            "open": f'=HYPERLINK("{r["basecamp_url"]}","Open in Basecamp")',
            "url": r["basecamp_url"],
            "item_id": r["item_id"],
            "location_scope": c.get("location_scope", ""),
            "stale_risk": c.get("stale_risk", ""),
            "space_type": space_type(r["project"]),
            "dup_of_v1_title": "yes" if (r["export"] == "export-3"
                                         and r["title"].strip().lower() in v12_titles) else "",
            "status": status,
            "change_note": change_note,
        }

    for r in rows:
        key = (r["project"], r["item_id"])
        if r["export"] == "export-3":
            c = revisions.get(key) or classified.get(key)
            if c is None:
                missing.append(f"{key} {r['title'][:50]}")
                c = {"recommendation": "maybe", "summary": "(not classified)",
                     "reason": "classifier missed this row", "topics": []}
            note = c.get("change_note", "") if c.get("changed") else ""
            out_rows.append(build(r, c, "new", note))
        else:
            rev = revisions.get(key)
            if rev and rev.get("changed"):
                out_rows.append(build(r, rev, "revised", rev.get("change_note", "")))

    news = [x for x in out_rows if x["status"] == "new"]
    revs = [x for x in out_rows if x["status"] == "revised"]
    news.sort(key=lambda m: (REC_ORDER.get(m["recommendation"], 1), m["project"], m["posted"]))
    revs.sort(key=lambda m: (m["project"], m["posted"]))
    final = news + revs

    out = ROOT / "ledger-addendum.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(final[0].keys()))
        w.writeheader()
        w.writerows(final)

    from collections import Counter
    print(f"{len(final)} rows -> {out}  (new: {len(news)}, revised v1: {len(revs)})")
    print("new-row recommendations:", dict(Counter(x["recommendation"] for x in news)))
    print("location_scope on non-skip new rows:",
          dict(Counter(x["location_scope"] for x in news if x["recommendation"] != "skip")))
    print("stale_risk yes:", sum(1 for x in news if x["stale_risk"] == "yes"))
    print("dup_of_v1_title yes:", sum(1 for x in news if x["dup_of_v1_title"] == "yes"))
    if missing:
        print(f"WARNING {len(missing)} unclassified:", *missing[:10], sep="\n  ")


if __name__ == "__main__":
    main()
