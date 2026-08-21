#!/usr/bin/env python3
"""ASK-2: chunk + embed the corpus into corpus_chunks.

Reads every corpus_documents row eligible for search (status kept/canon),
finds which are dirty per corpus_chunk_sync_state (see the migration
supabase/migrations/20260821140000_ask2_hybrid_search.sql — a trigger marks
a document dirty whenever its title/body/summary/status/source_url
changes), re-chunks and re-embeds only those, and clears the dirty flag.
Safe to re-run after every ingest/sync batch (same trust model as
ingest_corpus.py / sync_decisions.py).

Embeddings: OpenAI text-embedding-3-small, called directly with
OPENAI_API_KEY from scripts/basecamp-corpus/.env (same file as
SUPABASE_SERVICE_ROLE_KEY — add OPENAI_API_KEY there; see README.md). If
the key is missing or a particular embedding call fails, the script still
chunks and writes FTS-searchable content (embedding left NULL for that
document) but leaves it marked dirty, so a future run finishes the job.
That is a deliberately honest partial state, not a silent degrade: nothing
here ever claims a document is fully synced when it isn't.

Usage:
  python3 scripts/basecamp-corpus/embed_corpus.py --dry-run   # always first
  python3 scripts/basecamp-corpus/embed_corpus.py

Requires scripts/basecamp-corpus/.env (see README.md).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from chunk_lib import chunk_document, dirty_document_ids, vector_literal  # noqa: E402
from corpus_lib import ALCAN_ORG_ID  # noqa: E402
from db import get_client  # noqa: E402

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_BATCH_SIZE = 64
OPENAI_URL = "https://api.openai.com/v1/embeddings"


def fetch_embeddings(texts: list[str], api_key: str) -> list[list[float]]:
    """Call OpenAI embeddings directly (stdlib only, matching the rest of
    scripts/basecamp-corpus/ — nothing here needs a network SDK)."""
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps({"model": EMBEDDING_MODEL, "input": texts}).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"OpenAI embeddings HTTP {e.code}: {detail}") from e
    ordered = sorted(data["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in ordered]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be (re)chunked without writing")
    args = parser.parse_args()

    client = get_client()
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("WARNING: OPENAI_API_KEY not set in scripts/basecamp-corpus/.env — "
              "chunks will be written with NO embeddings (FTS-only search still "
              "works). Documents stay marked dirty so a future run finishes the "
              "job once the key is added.", file=sys.stderr)

    docs = client.select_all(
        "corpus_documents", "id,title,body,summary,status",
        filters={"org_id": ALCAN_ORG_ID}, page_size=1000)
    eligible = [d for d in docs if d["status"] in ("kept", "canon")]
    eligible_ids = {d["id"] for d in eligible}

    sync_rows = client.select_all(
        "corpus_chunk_sync_state", "document_id,dirty", page_size=1000,
        order="document_id.asc")
    dirty_ids = dirty_document_ids(eligible_ids, sync_rows)
    dirty_docs = [d for d in eligible if d["id"] in dirty_ids]

    print(f"Eligible documents (kept/canon): {len(eligible)}  "
          f"dirty (need chunking): {len(dirty_docs)}")

    if args.dry_run:
        total_chunks = 0
        no_body = 0
        for d in dirty_docs:
            chunks = chunk_document(d["title"], d["body"], d["summary"])
            total_chunks += len(chunks)
            if not (d["body"] or "").strip():
                no_body += 1
        print(f"Dry run — would write {total_chunks} chunks across "
              f"{len(dirty_docs)} documents ({no_body} link-only / no body). "
              "No writes performed.")
        return

    embedded_docs = 0
    chunked_only_docs = 0
    empty_docs = 0
    total_chunks = 0
    for i, d in enumerate(dirty_docs, 1):
        chunks = chunk_document(d["title"], d["body"], d["summary"])
        if not chunks:
            # Nothing to chunk (blank title/body/summary) — clear dirty so
            # this doesn't spin forever; there is nothing more to extract.
            client.upsert("corpus_chunk_sync_state",
                           [{"document_id": d["id"], "dirty": False, "updated_at": now_iso()}],
                           on_conflict="document_id")
            empty_docs += 1
            continue

        embeddings: list[list[float] | None] = [None] * len(chunks)
        embed_ok = False
        if api_key:
            try:
                for start in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
                    batch = chunks[start:start + EMBEDDING_BATCH_SIZE]
                    vecs = fetch_embeddings(batch, api_key)
                    embeddings[start:start + len(batch)] = vecs
                embed_ok = True
            except Exception as e:  # noqa: BLE001 - report and keep going
                print(f"  embedding failed for {d['id']} ({d['title'][:60]!r}): {e}",
                      file=sys.stderr)

        # Clean slate for this document's chunks, then rewrite.
        client.delete("corpus_chunks", {"document_id": d["id"]})
        rows = []
        for idx, (content, vec) in enumerate(zip(chunks, embeddings)):
            row = {"document_id": d["id"], "chunk_index": idx, "content": content}
            if vec is not None:
                row["embedding"] = vector_literal(vec)
            rows.append(row)
        client.insert("corpus_chunks", rows)
        total_chunks += len(rows)

        sync_row = {
            "document_id": d["id"],
            "dirty": not embed_ok,
            "chunked_at": now_iso(),
            "updated_at": now_iso(),
        }
        if embed_ok:
            sync_row["embedded_at"] = now_iso()
        client.upsert("corpus_chunk_sync_state", [sync_row], on_conflict="document_id")

        if embed_ok:
            embedded_docs += 1
        else:
            chunked_only_docs += 1
        if i % 25 == 0 or i == len(dirty_docs):
            print(f"  processed {i}/{len(dirty_docs)}")

    print(f"Done. {total_chunks} chunks written across "
          f"{embedded_docs + chunked_only_docs} documents "
          f"({empty_docs} had nothing to chunk). "
          f"{embedded_docs} fully embedded, "
          f"{chunked_only_docs} chunked only (pending OPENAI_API_KEY or a retry).")


if __name__ == "__main__":
    main()
