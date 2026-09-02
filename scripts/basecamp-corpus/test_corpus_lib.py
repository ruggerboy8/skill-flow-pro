"""Unit tests for the pure ledger -> document logic. No database needed.

Run:  python3 -m unittest scripts.basecamp-corpus.test_corpus_lib
  or: cd scripts/basecamp-corpus && python3 -m unittest test_corpus_lib -v
"""

import unittest

from corpus_lib import (
    ALCAN_ORG_ID,
    classify_row,
    normalize_decision,
    parse_extracted_text,
    parse_posted_at,
    parse_stale_risk,
    parse_tier,
    plan_decision_updates,
    row_to_document,
)


def ledger_row(**overrides):
    row = {
        "decision": "",
        "recommendation": "keep",
        "title": "Limited exam policy.docx (13 KB)",
        "summary": "Policy on discount specials.",
        "kind": "file",
        "project": "kids-tooth-team",
        "audience": "dfi",
        "tier": "1",
        "location_scope": "general",
        "stale_risk": "",
        "posted": "2022-07-25",
        "url": "https://3.basecamp.com/5408254/buckets/28588288/uploads/5164429275",
        "item_id": "5164429275",
    }
    row.update(overrides)
    return row


class ParseExtractedTextTests(unittest.TestCase):
    def test_returns_body_after_marker(self):
        raw = "TITLE: x\nKIND: message\n\n--- BODY ---\nHello world.\n"
        self.assertEqual(parse_extracted_text(raw), "Hello world.")

    def test_no_body_sentinel_maps_to_none(self):
        raw = "TITLE: x\n\n--- BODY ---\n(no body text)\n"
        self.assertIsNone(parse_extracted_text(raw))

    def test_missing_marker_maps_to_none(self):
        self.assertIsNone(parse_extracted_text("TITLE: x\nno marker here"))

    def test_empty_body_maps_to_none(self):
        self.assertIsNone(parse_extracted_text("TITLE: x\n--- BODY ---\n   \n"))

    def test_marker_inside_body_is_preserved(self):
        raw = "TITLE: x\n--- BODY ---\nfirst\n--- BODY ---\nsecond"
        self.assertEqual(parse_extracted_text(raw), "first\n--- BODY ---\nsecond")


class ClassifyRowTests(unittest.TestCase):
    def test_keep_and_maybe_import(self):
        self.assertTrue(classify_row(ledger_row(recommendation="keep"))[0])
        self.assertTrue(classify_row(ledger_row(recommendation="maybe"))[0])

    def test_skip_recommendation_skipped(self):
        ok, reason = classify_row(ledger_row(recommendation="skip"))
        self.assertFalse(ok)
        self.assertIn("skip", reason)

    def test_blank_recommendation_skipped(self):
        self.assertFalse(classify_row(ledger_row(recommendation=""))[0])

    def test_videos_deferred_even_when_keep(self):
        ok, reason = classify_row(ledger_row(kind="video"))
        self.assertFalse(ok)
        self.assertIn("video", reason)


class FieldParsingTests(unittest.TestCase):
    def test_posted_date_only(self):
        self.assertEqual(parse_posted_at("2022-07-25"), "2022-07-25T00:00:00+00:00")

    def test_posted_full_timestamp(self):
        self.assertEqual(parse_posted_at("2022-12-30T17:18:16Z"),
                         "2022-12-30T17:18:16+00:00")

    def test_posted_blank_or_garbage(self):
        self.assertIsNone(parse_posted_at(""))
        self.assertIsNone(parse_posted_at("not-a-date"))

    def test_tier(self):
        self.assertEqual(parse_tier("2"), 2)
        self.assertIsNone(parse_tier(""))
        self.assertIsNone(parse_tier("high"))

    def test_stale_risk(self):
        self.assertTrue(parse_stale_risk("yes"))
        self.assertFalse(parse_stale_risk(""))
        self.assertFalse(parse_stale_risk("no"))


class RowToDocumentTests(unittest.TestCase):
    def test_full_mapping(self):
        doc = row_to_document(ledger_row(), "The body.")
        self.assertEqual(doc, {
            "org_id": ALCAN_ORG_ID,
            "title": "Limited exam policy.docx (13 KB)",
            "body": "The body.",
            "summary": "Policy on discount specials.",
            "tier": 1,
            "audience": "dfi",
            "source_kind": "basecamp",
            "source_url": "https://3.basecamp.com/5408254/buckets/28588288/uploads/5164429275",
            "source_item_id": "5164429275",
            "posted_at": "2022-07-25T00:00:00+00:00",
            "stale_risk": False,
            "location_scope": "general",
        })

    def test_pdf_title_and_link_only(self):
        doc = row_to_document(ledger_row(), None)
        self.assertIsNone(doc["body"])
        self.assertTrue(doc["source_url"])

    def test_status_is_never_set_by_ingest_mapping(self):
        # Curation state belongs to sync_decisions / the corpus manager.
        doc = row_to_document(ledger_row(), "x")
        self.assertNotIn("status", doc)
        self.assertNotIn("expert_area_id", doc)
        self.assertNotIn("reviewed_by", doc)

    def test_blank_optionals_become_none(self):
        doc = row_to_document(
            ledger_row(summary="", audience="", location_scope="", url="", posted=""),
            None)
        for key in ("summary", "audience", "location_scope", "source_url", "posted_at"):
            self.assertIsNone(doc[key], key)


class DecisionTests(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_decision("keep"), "kept")
        self.assertEqual(normalize_decision("Reject"), "rejected")
        self.assertIsNone(normalize_decision(""))
        self.assertIsNone(normalize_decision("maybe"))

    def test_plan_updates(self):
        sheet = [
            {"item_id": "1", "decision": "keep"},     # unreviewed -> kept
            {"item_id": "2", "decision": "reject"},   # kept -> rejected
            {"item_id": "3", "decision": "keep"},     # already kept -> no-op
            {"item_id": "4", "decision": "reject"},   # canon -> protected
            {"item_id": "5", "decision": "keep"},     # not in corpus -> missing
            {"item_id": "6", "decision": ""},         # no decision -> ignored
        ]
        existing = {"1": "unreviewed", "2": "kept", "3": "kept",
                    "4": "canon", "6": "unreviewed"}
        updates, skipped_canon, missing = plan_decision_updates(sheet, existing)
        self.assertEqual(updates, {"1": "kept", "2": "rejected"})
        self.assertEqual(skipped_canon, ["4"])
        self.assertEqual(missing, ["5"])

    def test_rejected_row_can_be_rescued_back_to_kept(self):
        updates, _, _ = plan_decision_updates(
            [{"item_id": "9", "decision": "keep"}], {"9": "rejected"})
        self.assertEqual(updates, {"9": "kept"})


if __name__ == "__main__":
    unittest.main()
