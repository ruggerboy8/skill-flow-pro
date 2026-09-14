// LRM-10 tests for the edge function's own HTML helpers. This file is plain
// TypeScript with no Deno-specific globals (no `Deno.*`, no remote URL
// imports), so vitest can import and exercise it directly -- testing the
// actual server-side sanitizer, not a duplicate of it.

import { describe, it, expect } from 'vitest';
import {
  sanitizeBlastHtml, blastHtmlToPlainText, hasVisibleText, upgradeBlastBodyToHtml,
  CANONICAL_BLAST_TAGS,
} from './htmlUtils';

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

  // QA fix #2's exact payloads (bug: the trailing escape pass checked only
  // that a `<` was followed by an allowlisted tag NAME plus a word boundary
  // -- a word boundary matches after a space just as well as after `>`, so
  // an attribute-bearing fragment glued to a legitimate duplicate tag
  // survived with its attributes, and jsdom parsed a live onclick).
  // Parses sanitized output the way a browser (or the client's
  // dangerouslySetInnerHTML render) actually would, so "does onclick
  // survive" is checked as a real DOM property, not a raw substring --
  // the escaped fragment still contains the literal word "onclick" as
  // inert text, which is exactly the safe outcome, so a plain
  // `.not.toContain('onclick')` assertion is the wrong test (it was the
  // same mistake made once already against QA's first sanitizer bypass).
  function hasLiveOnclickAttribute(html: string): boolean {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.querySelector('[onclick]') !== null;
  }

  describe('QA payload: attribute-bearing tag glued to a legitimate duplicate tag', () => {
    const payload = '<strong onclick=alert(1) <strong>bold</strong>';

    it('produces no element with a live onclick attribute when parsed as HTML', () => {
      expect(hasLiveOnclickAttribute(sanitizeBlastHtml(payload))).toBe(false);
    });

    it('still renders the legitimate trailing <strong>bold</strong>', () => {
      expect(sanitizeBlastHtml(payload)).toContain('<strong>bold</strong>');
    });

    it('produces exactly the expected sanitized output', () => {
      expect(sanitizeBlastHtml(payload)).toBe('&lt;strong onclick=alert(1) <strong>bold</strong>');
    });
  });

  describe('QA payload: attribute-bearing <p> glued to a legitimate duplicate tag', () => {
    const payload = '<p onclick=alert(document.cookie) <p>click me</p>';

    it('produces no element with a live onclick attribute when parsed as HTML', () => {
      expect(hasLiveOnclickAttribute(sanitizeBlastHtml(payload))).toBe(false);
    });

    it('still renders the legitimate trailing <p>click me</p>', () => {
      expect(sanitizeBlastHtml(payload)).toContain('<p>click me</p>');
    });

    it('produces exactly the expected sanitized output', () => {
      expect(sanitizeBlastHtml(payload)).toBe('&lt;p onclick=alert(document.cookie) <p>click me</p>');
    });
  });

  // Structural invariant, not another one-off payload assertion: whatever
  // the exact shape of a future bypass attempt, sanitizeBlastHtml's output
  // must never contain a `<` that begins anything other than one of the
  // exact canonical tag literals. Checking this directly, rather than only
  // asserting "no onclick" or "no <img", means a regex change that reopens
  // a hole through some other attribute or tag name still fails this test.
  function everyAngleBracketStartsACanonicalTag(html: string): boolean {
    for (let i = 0; i < html.length; i++) {
      if (html[i] !== '<') continue;
      if (!CANONICAL_BLAST_TAGS.some((tag) => html.startsWith(tag, i))) return false;
    }
    return true;
  }

  describe('structural invariant: every < in the output begins an exact canonical tag literal', () => {
    const payloads = [
      // benign, well-formed content
      '<p><strong>Focus</strong></p><ul><li>One</li></ul><br>',
      '<p><em>note</em></p><ol><li>a</li><li>b</li></ol>',
      // every previous QA bypass, kept here as permanent regression pins
      '<p>Before</p><img src=x onerror=alert(1)',
      '<p>Before</p><img src=x onerror=alert(1)<p>Next</p>',
      '<p>score < 3 & rising</p>',
      '<strong onclick=alert(1) <strong>bold</strong>',
      '<p onclick=alert(document.cookie) <p>click me</p>',
      // other adversarial shapes, none of them QA-reported, added to widen
      // the net this invariant casts
      '<div onclick=alert(1)>text</div>',
      '<STRONG ONCLICK=ALERT(1)>x</STRONG>',
      '<script>alert(1)</script><p>after</p>',
      '<br onclick=alert(1)>',
      '<brx>not br</brx>',
      '< strong>space after bracket</ strong>',
      '<p><img src=x onerror=alert(1)></p>',
      '<a href="javascript:alert(1)">click</a>',
      '<<script>alert(1)</script>',
    ];

    it.each(payloads)('holds for payload: %s', (payload) => {
      const result = sanitizeBlastHtml(payload);
      expect(everyAngleBracketStartsACanonicalTag(result)).toBe(true);
    });
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
