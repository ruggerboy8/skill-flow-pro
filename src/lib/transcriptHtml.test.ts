// EVAL-4 tests for plainTextTranscriptToHtml -- see transcriptHtml.ts for the
// bug this fixes (bare `\n` in a plain-text transcript collapsing when
// RichTextEditor parses `value` as HTML).

import { describe, it, expect } from 'vitest';
import { plainTextTranscriptToHtml, isLikelyHtml } from './transcriptHtml';

describe('plainTextTranscriptToHtml', () => {
  it('splits a double-newline into separate paragraph blocks', () => {
    const result = plainTextTranscriptToHtml('First paragraph.\n\nSecond paragraph.');
    expect(result).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it('converts a single newline within a paragraph into a <br>, not a new paragraph', () => {
    const result = plainTextTranscriptToHtml('Line one\nLine two');
    expect(result).toBe('<p>Line one<br>Line two</p>');
  });

  it('collapses a run of 3+ blank lines to a single paragraph boundary', () => {
    const result = plainTextTranscriptToHtml('First.\n\n\n\nSecond.');
    expect(result).toBe('<p>First.</p><p>Second.</p>');
  });

  it('returns already-HTML input unchanged (paragraph tags)', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
    expect(plainTextTranscriptToHtml(html)).toBe(html);
  });

  it('returns already-HTML input unchanged (line-break tag)', () => {
    const html = '<p>Line one<br>Line two</p>';
    expect(plainTextTranscriptToHtml(html)).toBe(html);
  });

  it('returns already-HTML input unchanged (div-wrapped content, as Quill sometimes emits)', () => {
    const html = '<div>Some content</div><div>More content</div>';
    expect(plainTextTranscriptToHtml(html)).toBe(html);
  });

  it('returns already-HTML input unchanged (list content)', () => {
    const html = '<ul><li>One</li><li>Two</li></ul>';
    expect(plainTextTranscriptToHtml(html)).toBe(html);
  });

  it('escapes HTML special characters, in order, before adding tags', () => {
    const result = plainTextTranscriptToHtml('Dr. A & Dr. B discussed <options>\n\nFollow-up next week');
    expect(result).toBe(
      '<p>Dr. A &amp; Dr. B discussed &lt;options&gt;</p><p>Follow-up next week</p>'
    );
  });

  it('escapes a bare ampersand without colliding with the paragraph/br tags it adds', () => {
    const result = plainTextTranscriptToHtml('A & B\nC & D\n\nE & F');
    expect(result).toBe('<p>A &amp; B<br>C &amp; D</p><p>E &amp; F</p>');
  });

  it('returns empty string for null', () => {
    expect(plainTextTranscriptToHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(plainTextTranscriptToHtml(undefined)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(plainTextTranscriptToHtml('')).toBe('');
  });

  it('returns empty string for a whitespace-only string', () => {
    expect(plainTextTranscriptToHtml('   \n\n   ')).toBe('');
  });

  it('drops empty/whitespace-only paragraphs produced by leading/trailing blank lines', () => {
    const result = plainTextTranscriptToHtml('\n\nOnly paragraph.\n\n');
    expect(result).toBe('<p>Only paragraph.</p>');
  });
});

describe('isLikelyHtml', () => {
  it('detects a <p> tag', () => {
    expect(isLikelyHtml('<p>hi</p>')).toBe(true);
  });

  it('detects a <br> tag', () => {
    expect(isLikelyHtml('hi<br>there')).toBe(true);
  });

  it('returns false for plain text with no tags', () => {
    expect(isLikelyHtml('just plain text with\nnewlines')).toBe(false);
  });

  it('returns false for plain text that merely mentions angle brackets as prose', () => {
    expect(isLikelyHtml('the patient said "less than 5 minutes"')).toBe(false);
  });
});
