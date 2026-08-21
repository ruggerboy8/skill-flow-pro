// ASK-2 citations fix: pure citation-index mapping, shared by ask-alcan-v2.
//
// v1 (ask-alcan/index.ts) packs the whole corpus as document content blocks
// on the first user message and maps Anthropic's native `document_index`
// citations back to that packed array. v2 surfaces documents through tool
// results instead (search_corpus snippets and read_document bodies, each as
// a citable `document` content block), but the citation-index arithmetic is
// the same idea: Anthropic numbers document blocks 0-based in the order they
// appear across the whole request, and a citation on a text block names the
// index it drew from. This module collects those indexes, dedupes them, and
// maps them back to the caller's ordered list of surfaced documents.
//
// No Deno-specific imports here on purpose — this file is imported both by
// the edge function (Deno) and by a Vitest unit test (Node), matching the
// existing supabase/functions/_shared/sequencerScoring.ts pattern.

/** One document made available to the model, in the order it was first
 * surfaced (i.e. the order its content block was pushed into the request). */
export interface CitableDoc {
  document_id: string;
  title: string;
  source_url: string | null;
}

/** The frozen citation shape returned in the {answer, citations} contract. */
export interface Citation {
  document_id: string;
  title: string;
  source_url: string | null;
}

/** Structural subset of Anthropic's TextCitation union we rely on. Every
 * citation type anchored to a document content block (char_location,
 * page_location, content_block_location) carries document_index; citation
 * types that aren't document-anchored (if any) simply won't match this
 * shape and are ignored below. */
interface CitationLike {
  document_index?: number;
}

/** Structural subset of Anthropic's ContentBlock union we rely on. */
interface ContentBlockLike {
  type: string;
  citations?: CitationLike[] | null;
}

/**
 * Collect the documents actually cited in a response's text blocks.
 *
 * Mirrors v1's inline logic (see ask-alcan/index.ts): walk every text
 * block's citations, take `document_index`, dedupe in first-cited order,
 * then map each index back to `citableDocs`.
 *
 * v2-specific wrinkle: unlike v1 (one document block per document, ever),
 * the same logical document can reach the model as more than one document
 * block — once as a search_corpus snippet, again in full via read_document.
 * Those occurrences get distinct document_index values but share a
 * document_id. If the model cites both, this collapses them to a single
 * entry (first-cited order) so the frozen contract's citations array holds
 * one row per document, not per document-block occurrence.
 *
 * Out-of-range indexes (defensive only — should not happen if citableDocs
 * is built correctly) are silently skipped rather than throwing, matching
 * v1's `.filter((i) => i >= 0 && i < packed.length)` guard.
 */
export function collectCitations(
  content: readonly ContentBlockLike[],
  citableDocs: readonly CitableDoc[],
): Citation[] {
  const citedIndexes: number[] = [];
  for (const block of content) {
    if (block.type !== 'text') continue;
    for (const cite of block.citations ?? []) {
      if (typeof cite.document_index === 'number' && !citedIndexes.includes(cite.document_index)) {
        citedIndexes.push(cite.document_index);
      }
    }
  }

  const citations: Citation[] = [];
  const seenDocumentIds = new Set<string>();
  for (const index of citedIndexes) {
    const doc = citableDocs[index];
    if (!doc) continue;
    if (seenDocumentIds.has(doc.document_id)) continue;
    seenDocumentIds.add(doc.document_id);
    citations.push({ document_id: doc.document_id, title: doc.title, source_url: doc.source_url });
  }
  return citations;
}
