"""Pure logic for the ASK-2 corpus chunking + embedding sync.

Everything here is side-effect free and runnable without a database or
network access, so it is unit-tested directly (see test_chunk_lib.py). The
DB/OpenAI-touching entry point is embed_corpus.py.
"""

from __future__ import annotations

import re
from typing import Optional

# Keep chunks well under any embedding model's input limit and small enough
# that a single chunk stays a useful, focused unit for retrieval snippets.
MAX_CHUNK_CHARS = 3000

HEADING_RE = re.compile(r"^#{1,6}\s+.+$", re.MULTILINE)

# Precision is plenty for cosine similarity (embedding components are
# typically in roughly [-1, 1]); fixed-point avoids scientific notation,
# which pgvector's text input parser does not need to handle either way but
# this keeps the literal simple and unambiguous.
VECTOR_DECIMALS = 8


def chunk_document(title: Optional[str], body: Optional[str],
                    summary: Optional[str], max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split one document into chunk texts, in document order.

    - Documents with no body (link-only: videos pre-transcript, phase-1
      PDFs) chunk their title + summary as a single chunk, so they stay
      findable and linkable even without full text. A document with
      nothing at all (no title, body, or summary) yields no chunks.
    - Small documents (title + body fits in one chunk) chunk whole.
    - Larger documents split on markdown headings first, then by size
      (paragraph-packed) within any section still too big.
    """
    title = (title or "").strip()
    body = (body or "").strip()
    summary = (summary or "").strip()

    if not body:
        parts = [f"Title: {title}"] if title else []
        if summary:
            parts.append(f"Summary: {summary}")
        text = "\n".join(parts).strip()
        return [text] if text else []

    full = f"Title: {title}\n\n{body}" if title else body
    if len(full) <= max_chars:
        return [full]

    chunks: list[str] = []
    for section in _split_on_headings(full):
        if not section.strip():
            continue
        if len(section) <= max_chars:
            chunks.append(section)
        else:
            chunks.extend(_split_by_size(section, max_chars))
    return chunks if chunks else _split_by_size(full, max_chars)


def _split_on_headings(text: str) -> list[str]:
    """Split text into sections, each starting at a markdown heading line.

    Any text before the first heading (e.g. the "Title: ..." line) becomes
    its own leading section. Text with no headings at all returns as one
    section, unchanged.
    """
    matches = list(HEADING_RE.finditer(text))
    if not matches:
        return [text]
    starts = [m.start() for m in matches]
    sections = []
    preamble = text[: starts[0]]
    if preamble.strip():
        sections.append(preamble)
    ends = starts[1:] + [len(text)]
    for start, end in zip(starts, ends):
        sections.append(text[start:end])
    return sections


def _split_by_size(text: str, max_chars: int) -> list[str]:
    """Greedily pack paragraphs into chunks up to max_chars.

    Falls back to a hard slice for any single paragraph longer than
    max_chars on its own (rare: an unbroken wall of text).
    """
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        if len(para) <= max_chars:
            current = para
        else:
            for i in range(0, len(para), max_chars):
                chunks.append(para[i:i + max_chars])
    if current:
        chunks.append(current)
    return chunks


def dirty_document_ids(all_document_ids: set[str], sync_state_rows: list[dict]) -> set[str]:
    """Which documents (of `all_document_ids`) need (re-)chunking.

    A document is dirty if it has no sync-state row yet (never chunked) or
    its row has dirty=True. Sync-state rows for documents outside
    `all_document_ids` (e.g. no longer kept/canon) are simply ignored —
    this function only answers "which of these need work."
    """
    clean_ids = {r["document_id"] for r in sync_state_rows if not r["dirty"]}
    return {doc_id for doc_id in all_document_ids if doc_id not in clean_ids}


def vector_literal(embedding: list[float]) -> str:
    """Format an embedding as a pgvector text-input literal, e.g. "[0.1,-0.2]"."""
    return "[" + ",".join(f"{x:.{VECTOR_DECIMALS}f}" for x in embedding) + "]"
