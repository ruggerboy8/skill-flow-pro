#!/usr/bin/env python3
"""Unit tests for mirror_lib.py — pure logic, no database or network."""

import unittest

from mirror_lib import (
    doc_size_chars,
    expert_area_name_for_role,
    mirror_content_hash,
    mirror_source_item_id,
    plan_mirror_upserts,
    render_body,
    render_pro_move_document,
    render_title,
    should_short_circuit,
    size_distribution,
)


def script_resource(content_md="Say this to the patient.", title=None):
    return {"type": "script", "title": title, "content_md": content_md}


def doctor_resources(why="Why text.", looks="Looks text.", gut="Gut text.", script="Script text."):
    return [
        {"type": "doctor_why", "title": None, "content_md": why},
        {"type": "doctor_good_looks_like", "title": None, "content_md": looks},
        {"type": "doctor_gut_check", "title": None, "content_md": gut},
        {"type": "doctor_script", "title": None, "content_md": script},
    ]


def audio_resource(title="Script audio"):
    return {"type": "audio", "title": title, "content_md": None}


def move_row(**overrides):
    row = {
        "action_id": 1,
        "action_statement": "I always greet every patient with a smile.",
        "description": "First impressions set the tone for the visit.",
        "intervention_text": "Stand up. Make eye contact.",
        "competency_id": 9,
        "competency_name": "Welcoming Presence",
        "domain_name": "Cultural",
        "role_name": "Front Desk",
        "updated_at": "2026-03-27T22:31:10.516915+00:00",
    }
    row.update(overrides)
    return row


class RenderTitleTests(unittest.TestCase):
    def test_format(self):
        self.assertEqual(
            render_title("Front Desk", "I always smile."),
            "Front Desk pro move: I always smile.")

    def test_strips_whitespace(self):
        self.assertEqual(
            render_title("Doctor", "  I always ask.  "),
            "Doctor pro move: I always ask.")


class RenderBodyTests(unittest.TestCase):
    def test_header_line_always_present(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence", None, None, [])
        self.assertTrue(body.startswith(
            "Role: Front Desk | Domain: Cultural | Competency: Welcoming Presence"))

    def test_move_with_no_resources_omits_script_and_doctor_sections(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence",
                            "Why it matters text.", "Coaching nudge text.", [])
        self.assertIn("## Why it matters", body)
        self.assertIn("Why it matters text.", body)
        self.assertIn("## Coaching nudge", body)
        self.assertNotIn("## Script", body)
        self.assertNotIn("## Doctor guidance", body)
        self.assertNotIn("Also on this pro move", body)

    def test_blank_description_and_intervention_are_omitted_not_empty_headers(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence", "", "   ", [])
        self.assertNotIn("## Why it matters", body)
        self.assertNotIn("## Coaching nudge", body)

    def test_script_resource_with_no_title_uses_plain_heading(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence",
                            None, None, [script_resource()])
        self.assertIn("## Script\n\nSay this to the patient.", body)

    def test_script_resource_with_title_uses_titled_heading(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence",
                            None, None, [script_resource(title="Late arrival script")])
        self.assertIn("## Script: Late arrival script", body)

    def test_doctor_move_renders_all_four_subsections_in_order(self):
        body = render_body("Doctor", "Clinical", "Chart Accuracy", None, None,
                            doctor_resources())
        self.assertIn("## Doctor guidance", body)
        why_pos = body.index("### Why")
        looks_pos = body.index("### What good looks like")
        gut_pos = body.index("### Gut check")
        script_pos = body.index("### Script")
        self.assertTrue(why_pos < looks_pos < gut_pos < script_pos)
        self.assertIn("Why text.", body)
        self.assertIn("Looks text.", body)
        self.assertIn("Gut text.", body)
        self.assertIn("Script text.", body)

    def test_doctor_section_omitted_when_no_doctor_resources_present(self):
        body = render_body("Front Desk", "Cultural", "Welcoming Presence", None, None,
                            [script_resource()])
        self.assertNotIn("## Doctor guidance", body)

    def test_partial_doctor_resources_render_only_present_subsections(self):
        resources = [{"type": "doctor_why", "title": None, "content_md": "Why only."}]
        body = render_body("Doctor", "Clinical", "Chart Accuracy", None, None, resources)
        self.assertIn("### Why", body)
        self.assertNotIn("### What good looks like", body)
        self.assertNotIn("### Gut check", body)
        self.assertNotIn("### Script", body)

    def test_body_less_resource_gets_one_line_mention(self):
        body = render_body("Front Desk", "Clerical", "Fee Communication", None, None,
                            [audio_resource()])
        self.assertIn('Also on this pro move in the app: Audio: "Script audio".', body)
        self.assertNotIn("## Script", body)

    def test_multiple_mention_only_resources_joined(self):
        resources = [audio_resource(title="Script audio"),
                     {"type": "link", "title": "Reference sheet", "content_md": None}]
        body = render_body("Front Desk", "Clerical", "Fee Communication", None, None, resources)
        self.assertIn(
            'Also on this pro move in the app: Audio: "Script audio"; Link: "Reference sheet".',
            body)

    def test_mention_only_resource_with_no_title_falls_back_to_label(self):
        resources = [{"type": "video", "title": None, "content_md": None}]
        body = render_body("Front Desk", "Clerical", "Fee Communication", None, None, resources)
        self.assertIn('Video: "Video"', body)

    def test_full_doctor_move_with_everything(self):
        resources = doctor_resources() + [script_resource(title="Exam script")]
        body = render_body("Doctor", "Clinical", "Chart Accuracy",
                            "Consistency matters.", "Speak clearly.", resources)
        for expected in ("## Why it matters", "## Coaching nudge", "## Script: Exam script",
                          "## Doctor guidance", "### Why", "### Script"):
            self.assertIn(expected, body)


class RenderProMoveDocumentTests(unittest.TestCase):
    def test_full_mapping(self):
        doc = render_pro_move_document(move_row(), [], {"Front Desk": "area-uuid-1"})
        self.assertEqual(doc["title"], "Front Desk pro move: I always greet every patient with a smile.")
        self.assertEqual(doc["source_kind"], "authored")
        self.assertEqual(doc["source_item_id"], "promove:1")
        self.assertEqual(doc["source_url"], "/my-role/area/9?move=1")
        self.assertEqual(doc["status"], "canon")
        self.assertEqual(doc["posted_at"], "2026-03-27T22:31:10.516915+00:00")
        self.assertFalse(doc["stale_risk"])
        self.assertEqual(doc["expert_area_id"], "area-uuid-1")

    def test_unmapped_role_gets_null_expert_area(self):
        doc = render_pro_move_document(move_row(role_name="Hygienist"), [], {})
        self.assertIsNone(doc["expert_area_id"])


class ExpertAreaMappingTests(unittest.TestCase):
    def test_known_roles(self):
        self.assertEqual(expert_area_name_for_role("Doctor"), "clinical")
        self.assertEqual(expert_area_name_for_role("Front Desk"), "operations")
        self.assertEqual(expert_area_name_for_role("Office Manager"), "operations")
        self.assertEqual(expert_area_name_for_role("Dental Assistant"), "RDA practice")
        self.assertEqual(expert_area_name_for_role("Lead Dental Assistant"), "RDA practice")

    def test_unknown_role_returns_none(self):
        self.assertIsNone(expert_area_name_for_role("Hygienist"))


class MirrorSourceItemIdTests(unittest.TestCase):
    def test_format(self):
        self.assertEqual(mirror_source_item_id(42), "promove:42")


class MirrorContentHashTests(unittest.TestCase):
    def test_same_fields_same_hash(self):
        doc = {"title": "t", "body": "b", "source_url": "u", "posted_at": "p", "expert_area_id": "e"}
        self.assertEqual(mirror_content_hash(doc), mirror_content_hash(dict(doc)))

    def test_field_order_independent(self):
        a = {"title": "t", "body": "b", "source_url": "u", "posted_at": "p", "expert_area_id": "e"}
        b = {"expert_area_id": "e", "posted_at": "p", "source_url": "u", "body": "b", "title": "t"}
        self.assertEqual(mirror_content_hash(a), mirror_content_hash(b))

    def test_extra_fields_ignored(self):
        a = {"title": "t", "body": "b", "source_url": "u", "posted_at": "p", "expert_area_id": "e"}
        b = dict(a, id="some-uuid", status="canon")
        self.assertEqual(mirror_content_hash(a), mirror_content_hash(b))

    def test_body_change_changes_hash(self):
        a = {"title": "t", "body": "b1", "source_url": "u", "posted_at": "p", "expert_area_id": "e"}
        b = {"title": "t", "body": "b2", "source_url": "u", "posted_at": "p", "expert_area_id": "e"}
        self.assertNotEqual(mirror_content_hash(a), mirror_content_hash(b))


def rendered(action_id, **overrides):
    doc = {
        "title": f"Front Desk pro move: move {action_id}",
        "body": f"body {action_id}",
        "source_kind": "authored",
        "source_item_id": mirror_source_item_id(action_id),
        "source_url": f"/my-role/area/9?move={action_id}",
        "status": "canon",
        "posted_at": "2026-03-27T22:31:10+00:00",
        "stale_risk": False,
        "expert_area_id": "area-1",
    }
    doc.update(overrides)
    return doc


def existing_row(action_id, existing_id="row-uuid", **overrides):
    row = rendered(action_id)
    row["id"] = existing_id
    row.update(overrides)
    return row


class PlanMirrorUpsertsTests(unittest.TestCase):
    def test_no_existing_docs_everything_is_an_insert(self):
        docs = [rendered(1), rendered(2)]
        plan = plan_mirror_upserts(docs, [])
        self.assertEqual(len(plan["insert"]), 2)
        self.assertEqual(plan["update"], [])
        self.assertEqual(plan["retire"], [])

    def test_no_op_run_when_everything_matches(self):
        docs = [rendered(1), rendered(2)]
        existing = [existing_row(1), existing_row(2, existing_id="row-2")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(plan["insert"], [])
        self.assertEqual(plan["update"], [])
        self.assertEqual(plan["retire"], [])

    def test_content_change_triggers_update(self):
        docs = [rendered(1, body="new body")]
        existing = [existing_row(1, body="old body")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(plan["insert"], [])
        self.assertEqual(len(plan["update"]), 1)
        self.assertEqual(plan["update"][0]["id"], "row-uuid")
        self.assertEqual(plan["update"][0]["body"], "new body")

    def test_resource_only_change_still_triggers_update(self):
        # Same title/description-driven text, only the rendered body's
        # resource section differs (simulating an edited script resource).
        docs = [rendered(1, body="Role line\n\n## Script\n\nUpdated script text.")]
        existing = [existing_row(1, body="Role line\n\n## Script\n\nOld script text.")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(len(plan["update"]), 1)

    def test_retired_move_flips_existing_canon_row_to_retire_list(self):
        # move 2 is no longer active, so it's absent from `docs` this run.
        docs = [rendered(1)]
        existing = [existing_row(1), existing_row(2, existing_id="row-2", status="canon")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(plan["insert"], [])
        self.assertEqual(plan["update"], [])
        self.assertEqual(plan["retire"], [{"id": "row-2", "source_item_id": "promove:2"}])

    def test_already_rejected_row_not_retired_again(self):
        docs = [rendered(1)]
        existing = [existing_row(1), existing_row(2, existing_id="row-2", status="rejected")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(plan["retire"], [])

    def test_reactivated_move_triggers_update_even_with_identical_content(self):
        # move 2 was retired (rejected) and is now active again with the
        # exact same rendered content as when it was retired -- still needs
        # an update to flip status back to canon.
        docs = [rendered(1), rendered(2)]
        existing = [existing_row(1), existing_row(2, existing_id="row-2", status="rejected")]
        plan = plan_mirror_upserts(docs, existing)
        self.assertEqual(len(plan["update"]), 1)
        self.assertEqual(plan["update"][0]["source_item_id"], "promove:2")
        self.assertEqual(plan["update"][0]["status"], "canon")

    def test_non_promove_existing_docs_are_ignored(self):
        docs = [rendered(1)]
        basecamp_row = {"id": "bc-1", "source_item_id": "5164429275", "status": "kept",
                         "title": "t", "body": "b", "source_url": None,
                         "posted_at": None, "expert_area_id": None}
        plan = plan_mirror_upserts(docs, [existing_row(1), basecamp_row])
        self.assertEqual(plan["insert"], [])
        self.assertEqual(plan["update"], [])
        self.assertEqual(plan["retire"], [])


class SizeDistributionTests(unittest.TestCase):
    def test_doc_size_chars(self):
        self.assertEqual(doc_size_chars({"title": "abc", "body": "de"}), 5)
        self.assertEqual(doc_size_chars({"title": None, "body": None}), 0)

    def test_empty_list(self):
        self.assertEqual(size_distribution([]),
                          {"count": 0, "min": 0, "max": 0, "mean": 0.0, "median": 0})

    def test_stats_over_docs(self):
        docs = [{"title": "", "body": "a" * 10}, {"title": "", "body": "a" * 20},
                {"title": "", "body": "a" * 30}]
        stats = size_distribution(docs)
        self.assertEqual(stats["count"], 3)
        self.assertEqual(stats["min"], 10)
        self.assertEqual(stats["max"], 30)
        self.assertEqual(stats["mean"], 20.0)
        self.assertEqual(stats["median"], 20)

    def test_even_count_median_averages_middle_two(self):
        docs = [{"title": "", "body": "a" * n} for n in (10, 20, 30, 40)]
        stats = size_distribution(docs)
        self.assertEqual(stats["median"], 25)


class ShouldShortCircuitTests(unittest.TestCase):
    def test_no_stored_state_never_short_circuits(self):
        self.assertFalse(should_short_circuit(921, None, dry_run=True))
        self.assertFalse(should_short_circuit(921, None, dry_run=False))

    def test_no_current_watermark_never_short_circuits(self):
        self.assertFalse(should_short_circuit(None, {"watermark": 921, "source": "real"}, dry_run=True))

    def test_watermark_mismatch_never_short_circuits(self):
        state = {"watermark": 900, "source": "real"}
        self.assertFalse(should_short_circuit(921, state, dry_run=True))
        self.assertFalse(should_short_circuit(921, state, dry_run=False))

    def test_dry_run_trusts_a_dry_watermark(self):
        state = {"watermark": 921, "source": "dry"}
        self.assertTrue(should_short_circuit(921, state, dry_run=True))

    def test_dry_run_trusts_a_real_watermark(self):
        state = {"watermark": 921, "source": "real"}
        self.assertTrue(should_short_circuit(921, state, dry_run=True))

    def test_real_run_does_not_trust_a_dry_watermark(self):
        # The critical safety property: a preview must never cause a real
        # (write) run to skip actually syncing the corpus for the first time.
        state = {"watermark": 921, "source": "dry"}
        self.assertFalse(should_short_circuit(921, state, dry_run=False))

    def test_real_run_trusts_a_real_watermark(self):
        state = {"watermark": 921, "source": "real"}
        self.assertTrue(should_short_circuit(921, state, dry_run=False))


if __name__ == "__main__":
    unittest.main()
