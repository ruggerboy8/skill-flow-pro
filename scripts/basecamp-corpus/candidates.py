#!/usr/bin/env python3
"""Stage B: filter the raw inventory down to corpus candidates.

Deterministic rules only:
- keep substantive messages (30+ words, or carrying a real file attachment)
- keep all Basecamp documents
- keep uploads whose file is a document/video (skip photos)
- collapse duplicated to-do items (per-hire checklist copies) to one exemplar
- skip index pages, folders, chats, calendars (calendar events only if wordy)

Adds: reconstructed Basecamp deep link, vitals-newsletter flag,
Tim/Alex voice flag. Writes data/basecamp/candidates.csv.
"""

import csv
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"
ACCOUNT = "5408254"

DOC_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"}
VIDEO_EXTS = {"mp4", "mov"}
VOICE_AUTHORS = {"Dr. Alex Otto", "Tim Otto"}

# (section, type) -> Basecamp URL path segment
URL_PATH = {
    ("messages", "message"): "messages",
    ("to-do-lists", "message"): "todos",
    ("to-do-lists", "todolist"): "todolists",
    ("docs-and-files", "document"): "documents",
    ("docs-and-files", "upload"): "uploads",
    ("schedules", "unknown"): "schedule_entries",
}


def ext_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def norm_todo_title(title: str) -> str:
    t = re.sub(r"-\d+$", "", title)
    return re.sub(r"[-_]+", " ", t).strip().lower()


def main():
    rows = list(csv.DictReader(open(ROOT / "inventory.csv", encoding="utf-8")))
    candidates = []
    todo_groups = defaultdict(list)

    for r in rows:
        sec, typ = r["section"], r["type"]
        wc = int(r["word_count"])
        att_ext = ext_of(r["attachment_file"])

        if sec == "to-do-lists" and typ == "message":
            todo_groups[(r["project"], norm_todo_title(r["title"]))].append(r)
            continue

        keep = False
        kind = ""
        if sec == "messages" and typ == "message":
            keep = wc >= 30 or att_ext in DOC_EXTS | VIDEO_EXTS
            kind = "message"
        elif sec == "docs-and-files" and typ == "document":
            keep = True
            kind = "basecamp-doc"
        elif sec == "docs-and-files" and typ == "upload":
            if att_ext in DOC_EXTS:
                keep, kind = True, "file"
            elif att_ext in VIDEO_EXTS:
                keep, kind = True, "video"
        elif sec == "to-do-lists" and typ == "todolist":
            keep = wc >= 20
            kind = "todo-list"
        elif sec == "schedules":
            keep = wc >= 30
            kind = "calendar-event"

        if keep:
            r["kind"] = kind
            r["copies"] = "1"
            candidates.append(r)

    # Collapse per-hire duplicate to-dos: keep the wordiest exemplar of each.
    for (project, _norm), group in todo_groups.items():
        best = max(group, key=lambda g: int(g["word_count"]))
        if int(best["word_count"]) >= 30:
            best["kind"] = "todo-item"
            best["copies"] = str(len(group))
            candidates.append(best)

    for r in candidates:
        path = URL_PATH.get((r["section"], r["type"]), r["section"])
        r["basecamp_url"] = (
            f"https://3.basecamp.com/{ACCOUNT}/buckets/{r['project_id']}/{path}/{r['item_id']}"
        )
        title_l = r["title"].lower()
        r["vitals"] = "yes" if "vitals" in title_l else ""
        r["voice"] = "yes" if r["author"] in VOICE_AUTHORS and r["kind"] == "message" else ""

    candidates.sort(key=lambda r: (r["project"], r["section"], r["posted_at"]))

    fields = [
        "project", "kind", "title", "author", "posted_at", "word_count",
        "comment_count", "copies", "vitals", "voice", "attachment_file",
        "basecamp_url", "rel_path", "section", "type", "project_id", "item_id",
        "preview", "export",
    ]
    out = ROOT / "candidates.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(candidates)

    print(f"{len(candidates)} candidates -> {out}")
    from collections import Counter
    print("\nBy kind:", dict(Counter(r["kind"] for r in candidates)))
    print("By project:", dict(Counter(r["project"] for r in candidates)))
    print("Vitals issues:", sum(1 for r in candidates if r["vitals"]))
    print("Tim/Alex voice posts:", sum(1 for r in candidates if r["voice"]))


if __name__ == "__main__":
    main()
