// EVAL-4: converts a plain-text transcript (bare `\n` newlines, as produced
// by Whisper transcription -> format-transcript) into HTML paragraphs before
// it's handed to RichTextEditor as `value`. RichTextEditor writes `value`
// into Quill via `dangerouslyPasteHTML`, which parses it as HTML -- so a bare
// `\n` in plain text collapses under normal HTML whitespace rules and every
// paragraph break in a fresh transcript disappears the moment it's shown.
//
// Idempotent by design: a transcript that already looks like HTML (because
// the user has since edited it in Quill, which emits real `<p>`/`<br>` tags
// on save) is returned unchanged. Without that check, re-opening an
// already-saved HTML transcript would double-escape it.

const HTML_TAG_PATTERN = /<(p|br|div|ul|ol|li|h[1-6])[\s/>]/i;

export function isLikelyHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

export function plainTextTranscriptToHtml(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  if (isLikelyHtml(value)) return value;

  // Normalize CRLF / lone CR to `\n` so Windows-origin line endings split into
  // paragraphs and <br> the same as Unix newlines (no literal `\r` survives).
  const normalized = value.replace(/\r\n?/g, '\n');

  const escaped = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
