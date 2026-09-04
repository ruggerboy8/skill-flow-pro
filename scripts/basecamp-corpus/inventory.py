#!/usr/bin/env python3
"""Build an inventory of the Basecamp exports in data/basecamp/.

Walks every exported HTML page, pulls out the structured fields the export
format guarantees (type, title, author, date, body length, comment count),
and writes data/basecamp/inventory.csv + a summary to stdout.

Purely deterministic parsing. No AI involved. Safe to re-run any time.
"""

import csv
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"

# Folders inside a project that hold recordable HTML pages worth inventorying.
CONTENT_DIRS = [
    "messages",
    "docs-and-files",
    "chats",
    "to-do-lists",
    "email-forwards",
    "check-ins",
    "card-tables",
    "schedules",
]

ARTICLE_RE = re.compile(r'<article class="recordable ([a-z-]+)"', re.S)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
AUTHOR_RE = re.compile(
    r'<small class="metadata">\s*(?:Posted\s*by|Added by)\s+(.*?)\s*(?:•|·)', re.S
)
TIME_RE = re.compile(r'<time datetime="([^"]+)"')
CONTENT_RE = re.compile(r'<div class="formatted_content">(.*?)</div>\s*</section>', re.S)
COMMENT_RE = re.compile(r'<article[^>]*class="thread-entry recording"')
DOWNLOAD_RE = re.compile(r'href="([^"]*all-files-images-pdfs-spreadsheets-etc[^"]*)"')
TAG_RE = re.compile(r"<[^>]+>")


def strip_tags(fragment: str) -> str:
    text = TAG_RE.sub(" ", fragment)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_page(path: Path):
    raw = path.read_text(encoding="utf-8", errors="replace")

    m = ARTICLE_RE.search(raw)
    rec_type = m.group(1) if m else "unknown"

    # Title: first h1 after the recordable article starts (skips the page header).
    search_from = m.start() if m else 0
    h1 = H1_RE.search(raw, search_from)
    title = strip_tags(h1.group(1)) if h1 else path.stem

    a = AUTHOR_RE.search(raw, search_from)
    author = strip_tags(a.group(1)) if a else ""

    t = TIME_RE.search(raw, search_from)
    posted = t.group(1) if t else ""

    body = CONTENT_RE.search(raw)
    body_text = strip_tags(body.group(1)) if body else ""
    word_count = len(body_text.split()) if body_text else 0

    comments = len(COMMENT_RE.findall(raw))

    dl = DOWNLOAD_RE.search(raw)
    attachment = dl.group(1).rsplit("/", 1)[-1] if dl else ""

    # Basecamp numeric id is the trailing digits of the filename.
    idm = re.search(r"(\d+)(?:questionnaire)?$", path.stem)
    item_id = idm.group(1) if idm else ""

    return {
        "type": rec_type,
        "title": title,
        "author": author,
        "posted_at": posted,
        "word_count": word_count,
        "comment_count": comments,
        "attachment_file": attachment,
        "item_id": item_id,
        "preview": body_text[:200],
    }


def main():
    rows = []
    for export_dir in sorted(ROOT.glob("export-*")):
        for project_dir in sorted(export_dir.iterdir()):
            if not project_dir.is_dir() or project_dir.name == "zz_assets":
                continue
            pm = re.match(r"(.*)-(\d+)$", project_dir.name)
            project, project_id = (pm.group(1), pm.group(2)) if pm else (project_dir.name, "")
            for section in CONTENT_DIRS:
                sec_dir = project_dir / section
                if not sec_dir.is_dir():
                    continue
                for page in sorted(sec_dir.rglob("*.html")):
                    if page.name == "index.html":
                        continue
                    info = parse_page(page)
                    rows.append({
                        "export": export_dir.name,
                        "project": project,
                        "project_id": project_id,
                        "section": section,
                        "rel_path": str(page.relative_to(ROOT)),
                        **info,
                    })

    out = ROOT / "inventory.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} items -> {out}\n")

    def tally(key):
        counts = {}
        for r in rows:
            counts[r[key]] = counts.get(r[key], 0) + 1
        return sorted(counts.items(), key=lambda kv: -kv[1])

    print("By type:")
    for k, v in tally("type"):
        print(f"  {v:5d}  {k}")
    print("\nBy project / section (text-bearing items, word_count >= 30):")
    combo = {}
    for r in rows:
        if r["word_count"] >= 30:
            key = (r["project"], r["section"])
            combo[key] = combo.get(key, 0) + 1
    for (proj, sec), v in sorted(combo.items(), key=lambda kv: -kv[1]):
        print(f"  {v:5d}  {proj} / {sec}")


if __name__ == "__main__":
    main()
