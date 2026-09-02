/**
 * ASK-2 citations fix: unit tests for the pure citation-index mapping used
 * by ask-alcan-v2 to build the frozen {answer, citations} contract from
 * Anthropic's native document_index citations on tool-result document
 * blocks. See supabase/functions/_shared/citationMapping.ts for the why.
 */
import { describe, expect, it } from 'vitest';
import { collectCitations, type CitableDoc } from '../../supabase/functions/_shared/citationMapping.ts';

const DOC_A: CitableDoc = { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' };
const DOC_B: CitableDoc = { document_id: 'doc-b', title: 'Onboarding Script', source_url: null };
const DOC_C: CitableDoc = { document_id: 'doc-c', title: 'Recall Cadence', source_url: 'https://x/c' };

function textBlock(citations: Array<{ document_index?: number }> | null) {
  return { type: 'text' as const, text: 'irrelevant', citations };
}

describe('collectCitations', () => {
  it('returns an empty array when no text block carries a citation', () => {
    const content = [textBlock(null), textBlock([])];
    expect(collectCitations(content, [DOC_A, DOC_B])).toEqual([]);
  });

  it('maps a single citation back to the right citable doc', () => {
    const content = [textBlock([{ document_index: 1 }])];
    expect(collectCitations(content, [DOC_A, DOC_B, DOC_C])).toEqual([
      { document_id: 'doc-b', title: 'Onboarding Script', source_url: null },
    ]);
  });

  it('preserves first-cited order across multiple text blocks, not citableDocs order', () => {
    // DOC_C (index 2) is cited before DOC_A (index 0) -- the model can answer
    // in any order, and the frozen contract's order should follow that.
    const content = [
      textBlock([{ document_index: 2 }]),
      textBlock([{ document_index: 0 }]),
    ];
    expect(collectCitations(content, [DOC_A, DOC_B, DOC_C])).toEqual([
      { document_id: 'doc-c', title: 'Recall Cadence', source_url: 'https://x/c' },
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
    ]);
  });

  it('dedupes repeated citations of the same index', () => {
    const content = [
      textBlock([{ document_index: 0 }]),
      textBlock([{ document_index: 0 }, { document_index: 0 }]),
    ];
    expect(collectCitations(content, [DOC_A, DOC_B])).toEqual([
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
    ]);
  });

  it('collapses two document_index occurrences of the same document to one entry', () => {
    // e.g. doc-a surfaced once via search_corpus (index 0) and again in full
    // via read_document (index 2) -- both indexes share document_id 'doc-a'.
    const citableDocs: CitableDoc[] = [DOC_A, DOC_B, DOC_A];
    const content = [textBlock([{ document_index: 0 }, { document_index: 2 }])];
    expect(collectCitations(content, citableDocs)).toEqual([
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
    ]);
  });

  it('keeps first-cited-index order even when a later duplicate index appears first in scan order', () => {
    // The second occurrence of doc-a (index 2) is cited before the first
    // occurrence (index 0) is ever cited elsewhere; the entry should land at
    // the position of whichever index was actually cited first.
    const citableDocs: CitableDoc[] = [DOC_A, DOC_B, DOC_A];
    const content = [textBlock([{ document_index: 2 }, { document_index: 1 }, { document_index: 0 }])];
    expect(collectCitations(content, citableDocs)).toEqual([
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
      { document_id: 'doc-b', title: 'Onboarding Script', source_url: null },
    ]);
  });

  it('ignores non-text content blocks (e.g. tool_use)', () => {
    const content = [
      { type: 'tool_use', citations: [{ document_index: 0 }] },
      textBlock([{ document_index: 1 }]),
    ];
    expect(collectCitations(content, [DOC_A, DOC_B])).toEqual([
      { document_id: 'doc-b', title: 'Onboarding Script', source_url: null },
    ]);
  });

  it('silently skips an out-of-range document_index rather than throwing', () => {
    const content = [textBlock([{ document_index: 99 }, { document_index: 0 }])];
    expect(collectCitations(content, [DOC_A])).toEqual([
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
    ]);
  });

  it('ignores citation entries without a numeric document_index', () => {
    const content = [textBlock([{}, { document_index: 0 }])];
    expect(collectCitations(content, [DOC_A])).toEqual([
      { document_id: 'doc-a', title: 'Sedation Policy', source_url: 'https://x/a' },
    ]);
  });

  it('returns an empty array against an empty citableDocs list', () => {
    const content = [textBlock([{ document_index: 0 }])];
    expect(collectCitations(content, [])).toEqual([]);
  });
});
