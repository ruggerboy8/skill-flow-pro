// LRM-10 tests for the blast composer's plain-text <-> HTML conversions.
// See leadWeekBlastHtml.ts for why these exist as their own copy rather than
// reusing transcriptHtml.ts's near-identical converter.

import { describe, it, expect } from 'vitest';
import {
  isLikelyBlastHtml, upgradeBlastBodyToHtml, blastHtmlToPlainText, hasBlastBodyContent,
  reconcileNormalizedLoad, convertQuillListFlavors, needsSaveBeforeSend,
} from './leadWeekBlastHtml';

describe('isLikelyBlastHtml', () => {
  it('detects a <p> tag', () => {
    expect(isLikelyBlastHtml('<p>hi</p>')).toBe(true);
  });

  it('detects list markup', () => {
    expect(isLikelyBlastHtml('<ul><li>One</li></ul>')).toBe(true);
  });

  it('detects strong/em markup with no block tags', () => {
    expect(isLikelyBlastHtml('<strong>Focus</strong> this week')).toBe(true);
  });

  it('returns false for plain text with newlines', () => {
    expect(isLikelyBlastHtml('Hello doctors\n\nSee you Monday.')).toBe(false);
  });

  it('returns false for plain text that merely mentions angle brackets', () => {
    expect(isLikelyBlastHtml('score < 3 & rising')).toBe(false);
  });
});

describe('upgradeBlastBodyToHtml', () => {
  it('splits a double-newline into separate paragraph blocks', () => {
    const result = upgradeBlastBodyToHtml('First paragraph.\n\nSecond paragraph.');
    expect(result).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it('converts a single newline within a paragraph into a <br>, not a new paragraph', () => {
    const result = upgradeBlastBodyToHtml('Line one\nLine two');
    expect(result).toBe('<p>Line one<br>Line two</p>');
  });

  it('collapses a run of 3+ blank lines to a single paragraph boundary', () => {
    const result = upgradeBlastBodyToHtml('First.\n\n\n\nSecond.');
    expect(result).toBe('<p>First.</p><p>Second.</p>');
  });

  it('returns already-HTML input unchanged (paragraph tags)', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
    expect(upgradeBlastBodyToHtml(html)).toBe(html);
  });

  it('returns already-HTML input unchanged (list content)', () => {
    const html = '<ul><li>One</li><li>Two</li></ul>';
    expect(upgradeBlastBodyToHtml(html)).toBe(html);
  });

  it('escapes HTML special characters before adding tags', () => {
    const result = upgradeBlastBodyToHtml('Dr. A & Dr. B discussed <options>\n\nFollow-up next week');
    expect(result).toBe(
      '<p>Dr. A &amp; Dr. B discussed &lt;options&gt;</p><p>Follow-up next week</p>'
    );
  });

  it('returns empty string for null, undefined, and whitespace-only input', () => {
    expect(upgradeBlastBodyToHtml(null)).toBe('');
    expect(upgradeBlastBodyToHtml(undefined)).toBe('');
    expect(upgradeBlastBodyToHtml('')).toBe('');
    expect(upgradeBlastBodyToHtml('   \n\n   ')).toBe('');
  });

  it('normalizes CRLF line endings the same as bare \\n', () => {
    const result = upgradeBlastBodyToHtml('Line one\r\nLine two\r\n\r\nSecond paragraph.');
    expect(result).toBe('<p>Line one<br>Line two</p><p>Second paragraph.</p>');
    expect(result).not.toContain('\r');
  });

  it('drops empty/whitespace-only paragraphs from leading/trailing blank lines', () => {
    expect(upgradeBlastBodyToHtml('\n\nOnly paragraph.\n\n')).toBe('<p>Only paragraph.</p>');
  });
});

describe('convertQuillListFlavors', () => {
  // Codex review (PR #116, P2): the exact shape Quill 2 actually produces
  // for a bullet list, pinned against RichTextEditor's own test fixtures
  // (both flavors are `<ol><li data-list="...">`, never a bare `<ul>`).
  it('restores a Quill-flavored bullet list to a real <ul>', () => {
    const quillShaped = '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>One</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Two</li></ol>';
    expect(convertQuillListFlavors(quillShaped)).toBe(
      '<ul><li><span class="ql-ui" contenteditable="false"></span>One</li><li><span class="ql-ui" contenteditable="false"></span>Two</li></ul>'
    );
  });

  it('leaves a Quill-flavored ordered list as <ol>', () => {
    const quillShaped = '<ol><li data-list="ordered">One</li><li data-list="ordered">Two</li></ol>';
    expect(convertQuillListFlavors(quillShaped)).toBe('<ol><li>One</li><li>Two</li></ol>');
  });

  it('treats an <li> with no data-list attribute as matching its container', () => {
    expect(convertQuillListFlavors('<ul><li>One</li></ul>')).toBe('<ul><li>One</li></ul>');
    expect(convertQuillListFlavors('<ol><li>One</li></ol>')).toBe('<ol><li>One</li></ol>');
  });

  // QA finding (PR #116): a decoy "data-list=..."-shaped substring inside an
  // unrelated attribute's VALUE must not be mistaken for the real data-list
  // attribute. The real attribute (preceded by whitespace) wins.
  it('is not fooled by a data-list-shaped decoy inside another attribute value', () => {
    const decoy = '<ol><li title="data-list=ordered" data-list="bullet">One</li></ol>';
    expect(convertQuillListFlavors(decoy)).toBe('<ul><li>One</li></ul>');
  });

  // Quill's mixed case: bullet and ordered lists typed back to back collapse
  // into one <ol> holding both flavors of <li>. Split conservatively into
  // adjacent lists, in the order the items appeared -- never merged or
  // re-sorted.
  it('splits a mixed <ol> (both li flavors) into adjacent <ul> and <ol> runs, in order', () => {
    const mixed = '<ol><li data-list="bullet">Bullet one</li><li data-list="bullet">Bullet two</li><li data-list="ordered">Ordered one</li></ol>';
    expect(convertQuillListFlavors(mixed)).toBe(
      '<ul><li>Bullet one</li><li>Bullet two</li></ul><ol><li>Ordered one</li></ol>'
    );
  });

  it('splits an alternating mixed list into one run per flavor change', () => {
    const alternating = '<ol><li data-list="bullet">A</li><li data-list="ordered">B</li><li data-list="bullet">C</li></ol>';
    expect(convertQuillListFlavors(alternating)).toBe(
      '<ul><li>A</li></ul><ol><li>B</li></ol><ul><li>C</li></ul>'
    );
  });

  it('leaves non-list HTML untouched', () => {
    expect(convertQuillListFlavors('<p><strong>Focus</strong></p>')).toBe('<p><strong>Focus</strong></p>');
  });

  it('is empty-safe', () => {
    expect(convertQuillListFlavors(null)).toBe('');
    expect(convertQuillListFlavors(undefined)).toBe('');
    expect(convertQuillListFlavors('')).toBe('');
  });
});

describe('needsSaveBeforeSend', () => {
  const BODY = '<p>Saved draft</p>';
  const SUBJECT = 'Custom saved subject';
  const DEFAULT_SUBJECT = 'This week with your Lead RDAs: Week of Jan 5';

  // blast-send-trap incident: the real bug was Send/Test-send reading a
  // stale saved body while the editor held newer, unsaved text.
  it('is true when the editor has real unsaved body edits (subject unchanged)', () => {
    expect(needsSaveBeforeSend('<p>Edited text</p>', SUBJECT, BODY, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
  });

  // QA fail: the first version of this compared body only. The review
  // dialog shows editedSubject live while the send reads the DB row, so a
  // subject-only edit reproduced the exact same incident class.
  it('is true when the editor has real unsaved subject edits (body unchanged)', () => {
    expect(needsSaveBeforeSend(BODY, 'Edited subject line', BODY, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
  });

  it('is false when both body and subject exactly match the saved row', () => {
    expect(needsSaveBeforeSend(BODY, SUBJECT, BODY, SUBJECT, DEFAULT_SUBJECT)).toBe(false);
  });

  // Deliberately conservative: a normalization difference alone (not a real
  // edit) still reports "needs save" -- an extra idempotent save is
  // accepted rather than risk missing a real edit with a cleverer
  // comparison. See the function's own doc comment. Subject does NOT get
  // this same leniency (see the default-subject tests below) because the
  // saved-subject-empty case is provably safe to skip, unlike Quill
  // normalization.
  it('is true for a normalization-only body difference (Quill-flavored vs semantic list), by design', () => {
    const editedBody = '<ol><li data-list="bullet">One</li></ol>';
    const savedBody = '<ul><li>One</li></ul>';
    expect(needsSaveBeforeSend(editedBody, SUBJECT, savedBody, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
  });

  it('is true when the saved body is null or undefined (nothing persisted yet)', () => {
    expect(needsSaveBeforeSend('<p>Hello</p>', SUBJECT, null, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
    expect(needsSaveBeforeSend('<p>Hello</p>', SUBJECT, undefined, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
  });

  it('is false when body and subject are both empty/default and nothing was persisted yet', () => {
    expect(needsSaveBeforeSend('', DEFAULT_SUBJECT, '', '', DEFAULT_SUBJECT)).toBe(false);
    expect(needsSaveBeforeSend('', DEFAULT_SUBJECT, null, null, DEFAULT_SUBJECT)).toBe(false);
    expect(needsSaveBeforeSend('', DEFAULT_SUBJECT, undefined, undefined, DEFAULT_SUBJECT)).toBe(false);
  });

  // Subject-default handling: editedSubject's own useState initializer is
  // `weekBlast?.subject || buildDefaultBlastSubject(weekStartDate)`, so an
  // empty saved subject means editedSubject starts out equal to the
  // default, not empty. The send edge function falls back to that exact
  // same default when the saved subject is empty, so if nothing was typed,
  // skipping the save must not force one -- the email would come out
  // identical either way.
  describe('saved subject is empty (falls back to the default)', () => {
    it('is false when editedSubject still equals the default (nothing was typed)', () => {
      expect(needsSaveBeforeSend(BODY, DEFAULT_SUBJECT, BODY, '', DEFAULT_SUBJECT)).toBe(false);
      expect(needsSaveBeforeSend(BODY, DEFAULT_SUBJECT, BODY, null, DEFAULT_SUBJECT)).toBe(false);
      expect(needsSaveBeforeSend(BODY, DEFAULT_SUBJECT, BODY, undefined, DEFAULT_SUBJECT)).toBe(false);
    });

    // A whitespace-only saved subject is treated the same as empty, mirroring
    // the send edge function's own `subject.trim()` fallback check exactly.
    it('is false for a whitespace-only saved subject when editedSubject equals the default', () => {
      expect(needsSaveBeforeSend(BODY, DEFAULT_SUBJECT, BODY, '   ', DEFAULT_SUBJECT)).toBe(false);
    });

    // The default WOULD change what sends here: she typed something other
    // than the default, so skipping the save would email the wrong subject.
    // This is a real, savable edit.
    it('is true when editedSubject differs from the default (a real edit over an empty saved subject)', () => {
      expect(needsSaveBeforeSend(BODY, 'A subject she actually typed', BODY, '', DEFAULT_SUBJECT)).toBe(true);
    });
  });

  describe('saved subject is non-empty', () => {
    it('is false when editedSubject matches the saved (non-default) subject exactly', () => {
      expect(needsSaveBeforeSend(BODY, SUBJECT, BODY, SUBJECT, DEFAULT_SUBJECT)).toBe(false);
    });

    it('is true when editedSubject differs from the saved subject, even if editedSubject happens to equal the default', () => {
      // Saved subject is a real, non-empty subject; editedSubject was
      // changed to something that happens to equal the default. That's
      // still a real edit relative to what's saved, so it must save.
      expect(needsSaveBeforeSend(BODY, DEFAULT_SUBJECT, BODY, SUBJECT, DEFAULT_SUBJECT)).toBe(true);
    });
  });
});

describe('reconcileNormalizedLoad', () => {
  // QA fix (LRM-10): this is the exact bug -- a bullet-list draft loads,
  // Quill normalizes <ul> to <ol data-list="bullet">, and without this sync
  // the visible "current" state stayed on the raw pre-normalization string
  // forever, so it never matched the (correctly normalized) generated
  // baseline again.
  it('replaces the current value with the normalized one when nothing changed since the write', () => {
    const written = '<ul><li>One</li></ul>';
    const normalized = '<ol data-list="bullet"><li>One</li></ol>';
    expect(reconcileNormalizedLoad(written, written, normalized)).toBe(normalized);
  });

  it('keeps the current value when a real edit landed before the normalized report arrived', () => {
    const written = '<ul><li>One</li></ul>';
    const normalized = '<ol data-list="bullet"><li>One</li></ol>';
    const edited = '<p>User typed something else</p>';
    expect(reconcileNormalizedLoad(edited, written, normalized)).toBe(edited);
  });

  it('is a no-op when the normalized value happens to equal the written value', () => {
    const same = '<p>Hello doctors</p>';
    expect(reconcileNormalizedLoad(same, same, same)).toBe(same);
  });
});

describe('hasBlastBodyContent', () => {
  it('is false for an empty string', () => {
    expect(hasBlastBodyContent('')).toBe(false);
  });

  it("is false for Quill's canonical empty document (a bare <p><br></p>)", () => {
    expect(hasBlastBodyContent('<p><br></p>')).toBe(false);
  });

  it('is false for tags with only whitespace text', () => {
    expect(hasBlastBodyContent('<p>   </p>')).toBe(false);
  });

  it('is true once there is real text inside the tags', () => {
    expect(hasBlastBodyContent('<p>Hello doctors</p>')).toBe(true);
  });

  it('is true for a bullet list with no surrounding paragraph text', () => {
    expect(hasBlastBodyContent('<ul><li>One</li></ul>')).toBe(true);
  });

  it('is true for plain text with no tags at all (pre-upgrade rows)', () => {
    expect(hasBlastBodyContent('Hello doctors')).toBe(true);
  });

  it('is false for plain whitespace with no tags', () => {
    expect(hasBlastBodyContent('   \n  ')).toBe(false);
  });
});

describe('blastHtmlToPlainText', () => {
  it('converts paragraphs to blank-line-separated text', () => {
    const result = blastHtmlToPlainText('<p>First paragraph.</p><p>Second paragraph.</p>');
    expect(result).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('converts a <br> within a paragraph to a single newline', () => {
    expect(blastHtmlToPlainText('<p>Line one<br>Line two</p>')).toBe('Line one\nLine two');
  });

  it('converts list items to hyphen-space bullet lines', () => {
    const result = blastHtmlToPlainText('<ul><li>One</li><li>Two</li></ul>');
    expect(result).toBe('- One\n- Two');
  });

  it('converts ordered list items to hyphen-space bullet lines too (no numbering to preserve)', () => {
    const result = blastHtmlToPlainText('<ol><li>One</li><li>Two</li></ol>');
    expect(result).toBe('- One\n- Two');
  });

  it('strips strong/em tags but keeps their text', () => {
    const result = blastHtmlToPlainText('<p><strong>Focus:</strong> keep going. <em>Nice work.</em></p>');
    expect(result).toBe('Focus: keep going. Nice work.');
  });

  it('decodes HTML entities after stripping tags', () => {
    const result = blastHtmlToPlainText('<p>Dr. A &amp; Dr. B discussed &lt;options&gt;</p>');
    expect(result).toBe('Dr. A & Dr. B discussed <options>');
  });

  it('decodes nbsp, quote, and apostrophe entities', () => {
    const result = blastHtmlToPlainText('<p>It&#39;s &quot;go time&quot;&nbsp;now.</p>');
    expect(result).toBe(`It's "go time" now.`);
  });

  it('renders a mixed label + bullets + paragraph memo shape readably', () => {
    const html =
      '<p><strong>This week’s focus</strong></p><ul><li>Confirm treatment before numbing.</li><li>Two-minute warm handoff.</li></ul><p>No meeting was held this week.</p>';
    const result = blastHtmlToPlainText(html);
    expect(result).toBe(
      'This week’s focus\n\n- Confirm treatment before numbing.\n- Two-minute warm handoff.\n\nNo meeting was held this week.'
    );
  });

  it('returns empty string for null, undefined, and empty input', () => {
    expect(blastHtmlToPlainText(null)).toBe('');
    expect(blastHtmlToPlainText(undefined)).toBe('');
    expect(blastHtmlToPlainText('')).toBe('');
  });

  it('collapses runs of 3+ blank lines to a single blank line', () => {
    const result = blastHtmlToPlainText('<p>First.</p><p></p><p></p><p>Second.</p>');
    expect(result).toBe('First.\n\nSecond.');
  });
});
