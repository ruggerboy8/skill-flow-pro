// LRM-10 tests for the edge function's own HTML helpers. This file is plain
// TypeScript with no Deno-specific globals (no `Deno.*`, no remote URL
// imports), so vitest can import and exercise it directly -- testing the
// actual server-side sanitizer, not a duplicate of it.

import { describe, it, expect } from 'vitest';
import { sanitizeBlastHtml, blastHtmlToPlainText, hasVisibleText, upgradeBlastBodyToHtml } from './htmlUtils';

describe('sanitizeBlastHtml', () => {
  it('keeps allowlisted tags and strips attributes', () => {
    const result = sanitizeBlastHtml('<p class="x" style="color:red"><strong onclick="y">Focus</strong></p>');
    expect(result).toBe('<p><strong>Focus</strong></p>');
  });

  it('unwraps a disallowed tag but keeps its text content', () => {
    expect(sanitizeBlastHtml('<div>hello</div>')).toBe('hello');
  });

  it('removes script and style blocks along with their content', () => {
    expect(sanitizeBlastHtml('<p>safe</p><script>alert(1)</script><style>body{color:red}</style>')).toBe('<p>safe</p>');
  });

  it('removes html comments', () => {
    expect(sanitizeBlastHtml('<p>safe</p><!-- comment -->')).toBe('<p>safe</p>');
  });

  it('normalizes br to a plain self-closed form regardless of input shape', () => {
    expect(sanitizeBlastHtml('<p>a<br/>b<BR>c</p>')).toBe('<p>a<br>b<br>c</p>');
  });

  it('is empty-safe', () => {
    expect(sanitizeBlastHtml(null)).toBe('');
    expect(sanitizeBlastHtml(undefined)).toBe('');
    expect(sanitizeBlastHtml('')).toBe('');
  });

  // QA's exact payloads (bug: an unclosed/malformed tag either survived
  // untouched, or reached forward and swallowed the next real tag's `>`).
  describe('QA payload: unclosed tag with no closing bracket anywhere', () => {
    const payload = '<p>Before</p><img src=x onerror=alert(1)';

    it('does not let <img survive as a live tag', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result.toLowerCase()).not.toContain('<img');
    });

    it('escapes the stray bracket to inert text instead of dropping the content silently', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result).toBe('<p>Before</p>&lt;img src=x onerror=alert(1)');
    });

    it('keeps the legitimate preceding paragraph intact', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result).toContain('<p>Before</p>');
    });
  });

  describe('QA payload: malformed tag immediately followed by a real tag (swallow-the-next-bracket case)', () => {
    const payload = '<p>Before</p><img src=x onerror=alert(1)<p>Next</p>';

    it('does not let <img survive as a live tag', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result.toLowerCase()).not.toContain('<img');
    });

    it('escapes the malformed fragment to inert text rather than a live tag', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result).toContain('&lt;img');
    });

    it('still renders the legitimate following paragraph as a real <p> tag, not swallowed', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result).toContain('<p>Next</p>');
    });

    it('produces exactly the expected sanitized output', () => {
      const result = sanitizeBlastHtml(payload);
      expect(result).toBe('<p>Before</p>&lt;img src=x onerror=alert(1)<p>Next</p>');
    });
  });

  it('escapes a bare stray angle bracket in plain text that never formed a tag at all', () => {
    expect(sanitizeBlastHtml('<p>score < 3 & rising</p>')).toBe('<p>score &lt; 3 & rising</p>');
  });
});

describe('hasVisibleText', () => {
  it('is false for an empty Quill document', () => {
    expect(hasVisibleText('<p><br></p>')).toBe(false);
  });

  it('is true once there is real text', () => {
    expect(hasVisibleText('<p>Hello doctors</p>')).toBe(true);
  });

  it('is false for null/undefined/empty', () => {
    expect(hasVisibleText(null)).toBe(false);
    expect(hasVisibleText(undefined)).toBe(false);
    expect(hasVisibleText('')).toBe(false);
  });
});

describe('upgradeBlastBodyToHtml', () => {
  it('converts plain text with blank-line paragraphs and single-line breaks', () => {
    expect(upgradeBlastBodyToHtml('First.\n\nSecond line one\nSecond line two.')).toBe(
      '<p>First.</p><p>Second line one<br>Second line two.</p>'
    );
  });

  it('leaves already-HTML input unchanged', () => {
    const html = '<p>Already HTML</p>';
    expect(upgradeBlastBodyToHtml(html)).toBe(html);
  });

  it('is empty-safe', () => {
    expect(upgradeBlastBodyToHtml(null)).toBe('');
    expect(upgradeBlastBodyToHtml(undefined)).toBe('');
    expect(upgradeBlastBodyToHtml('   ')).toBe('');
  });
});

describe('blastHtmlToPlainText', () => {
  it('converts paragraphs, lists, and entities into readable plain text', () => {
    const html = '<p><strong>Focus</strong></p><ul><li>One</li><li>Two</li></ul><p>Done &amp; done.</p>';
    expect(blastHtmlToPlainText(html)).toBe('Focus\n\n- One\n- Two\n\nDone & done.');
  });

  it('is empty-safe', () => {
    expect(blastHtmlToPlainText(null)).toBe('');
    expect(blastHtmlToPlainText(undefined)).toBe('');
    expect(blastHtmlToPlainText('')).toBe('');
  });
});
