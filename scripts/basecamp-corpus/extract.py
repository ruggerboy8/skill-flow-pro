#!/usr/bin/env python3
"""Stage C prep: extract clean plain text for every candidate.

Writes data/basecamp/text/<project>/<item_id>.txt with a metadata header,
the body text, and any comment thread. For file uploads, records the
attachment's absolute path (and converts .docx/.doc to text via textutil)
so a reviewer can open the real file.
"""

import csv
import html
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"
OUT = ROOT / "text"

TAG_RE = re.compile(r"<[^>]+>")
CONTENT_RE = re.compile(r'<div class="formatted_content">(.*?)</div>\s*</section>', re.S)
THREAD_RE = re.compile(r'<article[^>]*class="thread-entry recording"[^>]*>(.*?)</article>', re.S)
THREAD_AUTHOR_RE = re.compile(r'<strong[^>]*>(.*?)</strong>', re.S)


def strip_tags(fragment: str) -> str:
    text = TAG_RE.sub(" ", fragment)
    text = html.unescape(text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", "\n", text)).strip()


def comments_text(raw: str) -> str:
    parts = []
    for m in THREAD_RE.finditer(raw):
        block = m.group(1)
        author_m = THREAD_AUTHOR_RE.search(block)
        author = strip_tags(author_m.group(1)) if author_m else "someone"
        body_m = CONTENT_RE.search(block + "</section>")  # comments reuse formatted_content
        body = strip_tags(body_m.group(1)) if body_m else strip_tags(block)
        if body:
            parts.append(f"[{author}] {body}")
    return "\n".join(parts)


def main():
    rows = list(csv.DictReader(open(ROOT / "candidates.csv", encoding="utf-8")))
    OUT.mkdir(exist_ok=True)
    converted = 0
    for r in rows:
        page = ROOT / r["rel_path"]
        raw = page.read_text(encoding="utf-8", errors="replace")

        body_m = CONTENT_RE.search(raw)
        body = strip_tags(body_m.group(1)) if body_m else ""
        comments = comments_text(raw)

        attachment_abs = ""
        attachment_txt = ""
        if r["attachment_file"]:
            proj_dir = page.parents[1]
            att = proj_dir / "all-files-images-pdfs-spreadsheets-etc" / r["attachment_file"]
            if att.exists():
                attachment_abs = str(att)
                if att.suffix.lower() in (".docx", ".doc"):
                    try:
                        res = subprocess.run(
                            ["textutil", "-convert", "txt", "-stdout", str(att)],
                            capture_output=True, text=True, timeout=30,
                        )
                        attachment_txt = res.stdout.strip()[:8000]
                        converted += 1
                    except Exception:
                        pass

        proj_out = OUT / r["project"]
        proj_out.mkdir(exist_ok=True)
        dest = proj_out / f"{r['item_id']}.txt"
        header = (
            f"TITLE: {r['title']}\n"
            f"KIND: {r['kind']}\n"
            f"AUTHOR: {r['author']}\n"
            f"POSTED: {r['posted_at']}\n"
            f"PROJECT: {r['project']}\n"
            f"COPIES: {r['copies']}\n"
            f"ATTACHMENT: {attachment_abs or '(none)'}\n"
            f"BASECAMP_URL: {r['basecamp_url']}\n"
        )
        sections = [header, "--- BODY ---", body or "(no body text)"]
        if attachment_txt:
            sections += ["--- ATTACHMENT TEXT (converted) ---", attachment_txt]
        if comments:
            sections += ["--- COMMENTS ---", comments]
        dest.write_text("\n".join(sections) + "\n", encoding="utf-8")

    print(f"extracted {len(rows)} candidates -> {OUT} ({converted} docx converted)")


if __name__ == "__main__":
    main()
