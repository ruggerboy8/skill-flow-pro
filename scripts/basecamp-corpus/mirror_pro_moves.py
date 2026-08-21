#!/usr/bin/env python3
"""ASK-5: mirror active pro moves + resources into corpus_documents.

Renders every active, platform-owned pro move (owner_org_id is null) as one
corpus document (Option A in the spec): the pro move's own prose
(action_statement, description, intervention_text) plus its active
pro_move_resources bodies (staff script, and for doctor moves the four
doctor_* sections) inlined as titled sections, with role/domain/competency
context in the header. Body-less resources (audio/video/link) get a
one-line mention instead of a section.

Mirror rows insert as `canon` directly (spec Decision 2) -- the framework
is already the most curated content in the product, so these skip the
Basecamp review queue. `source_kind='authored'`, `source_item_id` is
`promove:<action_id>` (the idempotency key, matching corpus_documents'
`unique (org_id, source_item_id)` constraint).

Refresh strategy (spec Decision 3): every run re-renders ALL active pro
moves and content-hashes each rendered doc against corpus_documents, so it
is self-healing -- it can never miss an edit, because it doesn't consume
change events, it just compares current state to current state. The
`framework_history.id` watermark (see db.select_max) is a pure performance
short-circuit: "did anything at all change since I last looked", checked in
one query, gated so a dry-run preview can never cause a real run to skip
its first actual sync (see mirror_lib.should_short_circuit's docstring).

Retired pro moves (active=false, the only removal path -- hard deletes are
trigger-blocked) flip their existing mirror row's status to `rejected`,
same semantics as a Basecamp reject: audit trail kept, row leaves the
answer set.

Usage:
  python3 scripts/basecamp-corpus/mirror_pro_moves.py --dry-run   # always first
  python3 scripts/basecamp-corpus/mirror_pro_moves.py
  python3 scripts/basecamp-corpus/mirror_pro_moves.py --chain     # + embed_corpus.py after

CRITICAL SEQUENCING RULE (see docs/specs/ask-5-pro-moves-corpus-mirror.md):
do not run this for real against prod before the ASK-2 cutover. ~339 new
canon docs would crowd the ask-alcan-v1 spike's 150k-token packing window.

Requires scripts/basecamp-corpus/.env (see README.md).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from corpus_lib import ALCAN_ORG_ID  # noqa: E402
from db import get_client  # noqa: E402
from mirror_lib import (  # noqa: E402
    expert_area_name_for_role,
    plan_mirror_upserts,
    render_pro_move_document,
    should_short_circuit,
    size_distribution,
)

STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".mirror_watermark.json")

# Fields a mirror row owns and refreshes on every update (mirrors
# ingest_corpus.py's CONTENT_FIELDS pattern: curation-adjacent fields like
# reviewed_by/created_by are never touched here).
MIRROR_WRITE_FIELDS = [
    "title", "body", "source_kind", "source_url", "status", "posted_at",
    "stale_risk", "expert_area_id",
]

INSERT_BATCH = 100


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_state(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    with open(path) as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return None


def save_state(path: str, watermark: int, dry_run: bool) -> None:
    with open(path, "w") as f:
        json.dump({
            "watermark": watermark,
            "source": "dry" if dry_run else "real",
            "checked_at": now_iso(),
        }, f, indent=2)
        f.write("\n")


def fetch_active_pro_moves(client) -> list[dict]:
    """Active, platform-owned pro moves (spec out-of-scope: org-owned pro
    moves are filtered out; there are none live yet, but this is the
    documented filter, not an assumption)."""
    raw = client.select_all(
        "pro_moves",
        "action_id,action_statement,description,intervention_text,"
        "competency_id,role_id,updated_at,owner_org_id",
        filters={"active": "true"}, page_size=1000, order="action_id.asc")
    return [m for m in raw if m.get("owner_org_id") is None]


def fetch_resources_by_action(client) -> dict[int, list[dict]]:
    rows = client.select_all(
        "pro_move_resources", "action_id,type,title,content_md,url,status",
        filters={"status": "active"}, page_size=1000)
    by_action: dict[int, list[dict]] = {}
    for r in rows:
        by_action.setdefault(r["action_id"], []).append(r)
    return by_action


def fetch_lookup(client, table: str, columns: str, key: str) -> dict:
    rows = client.select_all(table, columns, page_size=1000, order=f"{key}.asc")
    return {r[key]: r for r in rows}


def build_expert_area_id_by_role(client) -> tuple[dict[str, str | None], list[str]]:
    """Map role_name -> corpus_expert_areas.id for this org, via
    mirror_lib.EXPERT_AREA_BY_ROLE. A role that mirror_lib maps to an area
    name that doesn't exist in this org's corpus_expert_areas is a config
    error worth flagging immediately, so it warns unconditionally. A role
    with no entry in EXPERT_AREA_BY_ROLE at all is not warned about here --
    that only matters if the role actually has active pro moves, which
    render_all checks once it knows which roles are in play."""
    areas = client.select_all(
        "corpus_expert_areas", "id,area_name",
        filters={"org_id": ALCAN_ORG_ID}, page_size=1000)
    area_id_by_name = {a["area_name"]: a["id"] for a in areas}

    roles = client.select_all("roles", "role_id,role_name", page_size=1000, order="role_id.asc")
    role_names = sorted({r["role_name"] for r in roles})

    mapping: dict[str, str | None] = {}
    warnings: list[str] = []
    for role_name in role_names:
        area_name = expert_area_name_for_role(role_name)
        if area_name is None:
            mapping[role_name] = None
            continue
        area_id = area_id_by_name.get(area_name)
        if area_id is None:
            warnings.append(
                f"role {role_name!r} maps to expert area {area_name!r}, "
                "which doesn't exist in corpus_expert_areas for this org")
        mapping[role_name] = area_id

    return mapping, warnings


def render_all(client) -> tuple[list[dict], list[str]]:
    """Fetch everything and render one doc per active pro move.

    Returns (rendered_docs, warnings). A pro move whose role/competency
    lookup fails is skipped with a warning rather than crashing the whole
    run (defensive -- FK constraints should make this impossible today).
    """
    moves = fetch_active_pro_moves(client)
    resources_by_action = fetch_resources_by_action(client)
    domains = fetch_lookup(client, "domains", "domain_id,domain_name", "domain_id")
    competencies = fetch_lookup(
        client, "competencies", "competency_id,name,domain_id", "competency_id")
    roles = fetch_lookup(client, "roles", "role_id,role_name", "role_id")
    expert_area_id_by_role, warnings = build_expert_area_id_by_role(client)

    unmapped_roles_in_use = {
        roles[m["role_id"]]["role_name"] for m in moves if m["role_id"] in roles
        and expert_area_name_for_role(roles[m["role_id"]]["role_name"]) is None
    }
    for role_name in sorted(unmapped_roles_in_use):
        warnings.append(
            f"role {role_name!r} has active pro moves but no expert-area mapping "
            "in mirror_lib.EXPERT_AREA_BY_ROLE; expert_area_id left null")

    rendered = []
    for move in moves:
        competency = competencies.get(move["competency_id"])
        role = roles.get(move["role_id"])
        if competency is None or role is None:
            warnings.append(
                f"action_id {move['action_id']}: missing competency or role lookup, skipped")
            continue
        domain = domains.get(competency["domain_id"])
        if domain is None:
            warnings.append(
                f"action_id {move['action_id']}: missing domain lookup, skipped")
            continue
        enriched = dict(move,
                         competency_name=competency["name"],
                         domain_name=domain["domain_name"],
                         role_name=role["role_name"])
        doc = render_pro_move_document(
            enriched, resources_by_action.get(move["action_id"], []),
            expert_area_id_by_role)
        doc["org_id"] = ALCAN_ORG_ID
        rendered.append(doc)
    return rendered, warnings


def fetch_existing_mirror_docs(client) -> list[dict]:
    return client.select_all(
        "corpus_documents",
        "id,source_item_id,title,body,source_url,posted_at,expert_area_id,status",
        filters={"org_id": ALCAN_ORG_ID, "source_kind": "authored"}, page_size=1000)


def print_report(rendered: list[dict], plan: dict, warnings: list[str]) -> None:
    stats = size_distribution(rendered)
    print(f"Active platform pro moves rendered: {stats['count']}")
    print(f"  size (title+body chars): min={stats['min']} max={stats['max']} "
          f"mean={stats['mean']} median={stats['median']}")
    total_chars = sum(len(d.get("title") or "") + len(d.get("body") or "") for d in rendered)
    print(f"  total chars: {total_chars} (~{total_chars // 4} tokens at ~4 chars/token)")
    print(f"Plan: insert={len(plan['insert'])} update={len(plan['update'])} "
          f"retire={len(plan['retire'])} "
          f"unchanged={stats['count'] - len(plan['insert']) - len(plan['update'])}")
    for w in warnings:
        print(f"  WARNING: {w}", file=sys.stderr)


def print_samples(rendered: list[dict], n: int = 2) -> None:
    """Print up to `n` full sample docs: prefer one with a Doctor guidance
    section and one with none, for eyeballing the render shape."""
    with_doctor = [d for d in rendered if "## Doctor guidance" in (d["body"] or "")]
    without = [d for d in rendered if "## Doctor guidance" not in (d["body"] or "")]
    samples = (with_doctor[:1] + without[:1])[:n] or rendered[:n]
    print(f"\n--- {len(samples)} sample rendered doc(s) ---")
    for doc in samples:
        print(f"\n[{doc['source_item_id']}] {doc['title']}")
        print(f"source_url: {doc['source_url']}")
        print(doc["body"])
        print("--- end sample ---")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                      formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change without writing")
    parser.add_argument("--force", action="store_true",
                        help="ignore the stored watermark and always do a full render+diff")
    parser.add_argument("--chain", action="store_true",
                        help="on a real run with changes, also invoke embed_corpus.py")
    parser.add_argument("--no-samples", action="store_true",
                        help="skip printing full sample docs in dry-run output")
    parser.add_argument("--state-file", default=STATE_PATH,
                        help="path to the local watermark state file (gitignored)")
    args = parser.parse_args()

    client = get_client()

    current_watermark = client.select_max("framework_history", "id")
    state = load_state(args.state_file)

    if not args.force and should_short_circuit(current_watermark, state, args.dry_run):
        print(f"Watermark unchanged (framework_history max id = {current_watermark}, "
              f"last checked by a {state['source']} run at {state['checked_at']}) -- "
              "nothing to check. Exiting after one query.")
        return

    rendered, warnings = render_all(client)
    existing = fetch_existing_mirror_docs(client)
    plan = plan_mirror_upserts(rendered, existing)

    print_report(rendered, plan, warnings)

    if args.dry_run:
        if not args.no_samples:
            print_samples(rendered)
        print("\nDry run -- no writes performed.")
        save_state(args.state_file, current_watermark, dry_run=True)
        return

    for i in range(0, len(plan["insert"]), INSERT_BATCH):
        batch = plan["insert"][i:i + INSERT_BATCH]
        client.insert("corpus_documents", batch)
        print(f"  inserted {min(i + INSERT_BATCH, len(plan['insert']))}/{len(plan['insert'])}")

    for i, doc in enumerate(plan["update"], 1):
        patch = {k: doc[k] for k in MIRROR_WRITE_FIELDS}
        client.update_by_item_id("corpus_documents", ALCAN_ORG_ID, doc["source_item_id"], patch)
        if i % 50 == 0 or i == len(plan["update"]):
            print(f"  updated {i}/{len(plan['update'])}")

    for i, retirement in enumerate(plan["retire"], 1):
        client.update_by_item_id(
            "corpus_documents", ALCAN_ORG_ID, retirement["source_item_id"],
            {"status": "rejected"})
        if i % 50 == 0 or i == len(plan["retire"]):
            print(f"  retired {i}/{len(plan['retire'])}")

    changed = plan["insert"] or plan["update"] or plan["retire"]
    print(f"Done. {len(plan['insert'])} inserted, {len(plan['update'])} updated, "
          f"{len(plan['retire'])} retired.")

    save_state(args.state_file, current_watermark, dry_run=False)

    if changed:
        embed_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embed_corpus.py")
        if args.chain:
            print("Chaining into embed_corpus.py so ASK-2 re-embeds the changed docs...")
            subprocess.run([sys.executable, embed_script], check=True)
        else:
            print("Reminder: run `python3 scripts/basecamp-corpus/embed_corpus.py` "
                  "so ASK-2 re-embeds the changed docs (or re-run with --chain).")


if __name__ == "__main__":
    main()
