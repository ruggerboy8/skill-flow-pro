#!/usr/bin/env python3
"""Compile every message Tim Otto and Dr. Alex Otto wrote into per-author
markdown files (data/basecamp/voice/). These are style/voice reference for
the Ask assistant, so they deliberately include posts that are NOT
corpus-worthy as knowledge (shoutouts, culture posts) — the voice is the
point, not the facts.
"""

import csv
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "basecamp"
OUT = ROOT / "voice"

AUTHORS = {"Tim Otto": "tim-otto.md", "Dr. Alex Otto": "dr-alex-otto.md"}
MIN_WORDS = 20

TAG_RE = re.compile(r"<[^>]+>")
CONTENT_RE = re.compile(r'<div class="formatted_content">(.*?)</div>\s*</section>', re.S)


def strip_tags(fragment: str) -> str:
    text = TAG_RE.sub(" ", fragment)
    text = html.unescape(text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", "\n\n", text)).strip()


def main():
    rows = list(csv.DictReader(open(ROOT / "inventory.csv", encoding="utf-8")))
    OUT.mkdir(exist_ok=True)
    counts = {}
    for author, fname in AUTHORS.items():
        posts = [r for r in rows
                 if r["author"] == author and r["section"] == "messages"
                 and r["type"] == "message" and int(r["word_count"]) >= MIN_WORDS]
        posts.sort(key=lambda r: r["posted_at"])
        parts = [f"# {author} — Basecamp posts (voice reference)\n",
                 f"{len(posts)} posts, chronological. Compiled from the "
                 f"2026-08-21 Basecamp export for chatbot voice modeling.\n"]
        for r in posts:
            raw = (ROOT / r["rel_path"]).read_text(encoding="utf-8", errors="replace")
            m = CONTENT_RE.search(raw)
            body = strip_tags(m.group(1)) if m else ""
            if not body:
                continue
            parts.append(f"\n---\n\n## {r['title']}\n"
                         f"*{r['posted_at'][:10]} · {r['project']}*\n\n{body}\n")
        (OUT / fname).write_text("\n".join(parts), encoding="utf-8")
        counts[author] = len(posts)
    for a, n in counts.items():
        print(f"{a}: {n} posts -> {OUT / AUTHORS[a]}")


if __name__ == "__main__":
    main()
