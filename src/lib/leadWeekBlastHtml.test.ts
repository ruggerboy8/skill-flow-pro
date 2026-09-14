// LRM-10 tests for the blast composer's plain-text <-> HTML conversions.
// See leadWeekBlastHtml.ts for why these exist as their own copy rather than
// reusing transcriptHtml.ts's near-identical converter.

import { describe, it, expect } from 'vitest';
import {
  isLikelyBlastHtml, upgradeBlastBodyToHtml, blastHtmlToPlainText, hasBlastBodyContent,
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
