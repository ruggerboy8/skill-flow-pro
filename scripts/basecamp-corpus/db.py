"""Minimal PostgREST client for the corpus scripts (stdlib only).

Runs against prod with the service role key from scripts/basecamp-corpus/.env
(gitignored), the same trust model as scripts/demo-seed. Nothing here is
reachable from the app.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request


def load_env(path: str) -> None:
    """Load KEY=VALUE lines from a .env file into os.environ (no override)."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def get_client() -> "Postgrest":
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_env(env_path)
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n"
            "Copy scripts/basecamp-corpus/.env.example to scripts/basecamp-corpus/.env "
            "and fill both in (the .env file is gitignored — never commit it)."
        )
    return Postgrest(url, key)


class Postgrest:
    def __init__(self, base_url: str, service_key: str):
        self.rest = f"{base_url}/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, params: dict | None = None,
                 body: object = None, prefer: str | None = None):
        url = f"{self.rest}/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {detail}") from e

    def select_all(self, table: str, columns: str, filters: dict | None = None,
                   page_size: int = 1000, order: str = "id.asc") -> list[dict]:
        """Fetch every row matching `filters` ({col: value} -> eq), paging.

        `order` must be a stable, deterministic sort so paging can't skip or
        repeat rows; override it for tables whose primary key isn't `id`
        (e.g. corpus_chunk_sync_state, keyed on document_id).
        """
        rows: list[dict] = []
        offset = 0
        eq = {col: f"eq.{value}" for col, value in (filters or {}).items()}
        while True:
            page = self._request("GET", table, params={
                "select": columns, "limit": page_size, "offset": offset,
                "order": order, **eq,
            })
            rows.extend(page)
            if len(page) < page_size:
                return rows
            offset += page_size

    def select_max(self, table: str, column: str, filters: dict | None = None):
        """Return the maximum value of `column` in `table` (matching
        `filters`), in exactly one request (`order=<column>.desc&limit=1`),
        or None if no rows match. Used by mirror_pro_moves.py's watermark
        short-circuit, where paging via select_all would defeat the point
        (it would page through the whole table one row at a time)."""
        eq = {col: f"eq.{value}" for col, value in (filters or {}).items()}
        rows = self._request("GET", table, params={
            "select": column, "order": f"{column}.desc", "limit": 1, **eq,
        })
        return rows[0][column] if rows else None

    def insert(self, table: str, records: list[dict]) -> None:
        if records:
            self._request("POST", table, body=records, prefer="return=minimal")

    def delete(self, table: str, filters: dict) -> None:
        """Delete rows matching `filters` ({col: value} -> eq)."""
        eq = {col: f"eq.{value}" for col, value in filters.items()}
        self._request("DELETE", table, params=eq, prefer="return=minimal")

    def upsert(self, table: str, records: list[dict], on_conflict: str) -> None:
        """Insert rows, or update in place on a conflicting key (ASK-2's
        corpus_chunk_sync_state dirty-flag bookkeeping)."""
        if records:
            self._request("POST", table, params={"on_conflict": on_conflict}, body=records,
                          prefer="resolution=merge-duplicates,return=minimal")

    def update_by_item_id(self, table: str, org_id: str, item_id: str, patch: dict) -> None:
        """Update the row keyed by the composite (org_id, source_item_id)."""
        self._request("PATCH", table, params={
            "org_id": f"eq.{org_id}",
            "source_item_id": f"eq.{item_id}",
        }, body=patch, prefer="return=minimal")
