#!/usr/bin/env python3
"""Unit tests for chunk_lib.py — pure logic, no database or network."""

import unittest

from chunk_lib import chunk_document, dirty_document_ids, vector_literal


class ChunkDocumentTests(unittest.TestCase):
    def test_short_doc_is_one_chunk(self):
        chunks = chunk_document("Hygiene setup", "Turn on the sterilizer first.", None)
        self.assertEqual(len(chunks), 1)
        self.assertIn("Hygiene setup", chunks[0])
        self.assertIn("Turn on the sterilizer first.", chunks[0])

    def test_no_body_chunks_title_and_summary(self):
        chunks = chunk_document("Comfort setup video", None, "Covers headset placement.")
        self.assertEqual(chunks, ["Title: Comfort setup video\nSummary: Covers headset placement."])

    def test_no_body_no_summary_chunks_title_only(self):
        chunks = chunk_document("Untitled upload", None, None)
        self.assertEqual(chunks, ["Title: Untitled upload"])

    def test_nothing_at_all_yields_no_chunks(self):
        self.assertEqual(chunk_document(None, None, None), [])
        self.assertEqual(chunk_document("", "", ""), [])

    def test_body_only_whitespace_treated_as_no_body(self):
        chunks = chunk_document("Title only", "   \n  ", "A summary")
        self.assertEqual(chunks, ["Title: Title only\nSummary: A summary"])

    def test_large_doc_without_headings_splits_by_size(self):
        paragraph = "Sentence about the procedure. " * 20  # ~620 chars
        body = "\n\n".join([paragraph] * 10)  # ~6200 chars, no headings
        chunks = chunk_document("Long doc", body, None, max_chars=1000)
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertLessEqual(len(c), 1000)
        # No content lost: every paragraph's distinctive text survives.
        joined = " ".join(chunks)
        self.assertEqual(joined.count("Sentence about the procedure."), 200)

    def test_large_doc_with_headings_splits_on_sections(self):
        body = (
            "## Before you start\n" + ("prep step. " * 50) + "\n\n"
            "## During the visit\n" + ("visit step. " * 50) + "\n\n"
            "## After the visit\n" + ("wrap up step. " * 50)
        )
        chunks = chunk_document("Procedure", body, None, max_chars=800)
        self.assertGreater(len(chunks), 1)
        headings_seen = [h for h in ("Before you start", "During the visit", "After the visit")
                          if any(h in c for c in chunks)]
        self.assertEqual(headings_seen, ["Before you start", "During the visit", "After the visit"])
        for c in chunks:
            self.assertLessEqual(len(c), 800)

    def test_single_paragraph_longer_than_max_is_hard_sliced(self):
        body = "z" * 2500
        chunks = chunk_document("No headings here", body, None, max_chars=1000)
        # "Title: No headings here\n\n" + 2500 z's exceeds max_chars, no
        # headings, no paragraph breaks -> falls through to the hard-slice path.
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertLessEqual(len(c), 1000)
        self.assertEqual(sum(c.count("z") for c in chunks), 2500)

    def test_title_omitted_when_blank(self):
        chunks = chunk_document("", "Body text only.", None)
        self.assertEqual(chunks, ["Body text only."])


class DirtyDocumentIdsTests(unittest.TestCase):
    def test_document_with_no_sync_row_is_dirty(self):
        self.assertEqual(dirty_document_ids({"a"}, []), {"a"})

    def test_document_flagged_dirty_stays_dirty(self):
        rows = [{"document_id": "a", "dirty": True}]
        self.assertEqual(dirty_document_ids({"a"}, rows), {"a"})

    def test_document_marked_clean_is_excluded(self):
        rows = [{"document_id": "a", "dirty": False}]
        self.assertEqual(dirty_document_ids({"a"}, rows), set())

    def test_sync_row_for_out_of_scope_document_is_ignored(self):
        # "b" has a clean sync row but is not in the eligible set at all
        # (e.g. rejected out of kept/canon) — irrelevant either way.
        rows = [{"document_id": "b", "dirty": False}]
        self.assertEqual(dirty_document_ids({"a"}, rows), {"a"})

    def test_mixed_set(self):
        rows = [
            {"document_id": "clean", "dirty": False},
            {"document_id": "dirty", "dirty": True},
        ]
        result = dirty_document_ids({"clean", "dirty", "new"}, rows)
        self.assertEqual(result, {"dirty", "new"})


class VectorLiteralTests(unittest.TestCase):
    def test_format_shape(self):
        literal = vector_literal([0.1, -0.2, 3.0])
        self.assertTrue(literal.startswith("["))
        self.assertTrue(literal.endswith("]"))
        self.assertEqual(literal.count(","), 2)

    def test_round_trips_within_precision(self):
        values = [0.123456789, -1.0, 0.0]
        literal = vector_literal(values)
        parsed = [float(x) for x in literal.strip("[]").split(",")]
        for original, back in zip(values, parsed):
            self.assertAlmostEqual(original, back, places=7)

    def test_empty_embedding(self):
        self.assertEqual(vector_literal([]), "[]")


if __name__ == "__main__":
    unittest.main()
