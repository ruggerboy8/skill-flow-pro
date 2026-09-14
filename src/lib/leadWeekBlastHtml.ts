// LRM-10: the doctor-blast composer (BlastSlot in MeetingsAndFocusTab.tsx)
// swapped its plain Textarea for the shared RichTextEditor, so
// lead_week_blasts.body's content convention changes from plain text (bare
// `\n` newlines) to HTML going forward. Every already-sent blast, and
// possibly a live draft, predates this and is still plain text -- these are
// the pure, unit-tested pieces of that transition, kept independent of
// src/lib/transcriptHtml.ts (EVAL-4's near-identical converter) so this
// ticket doesn't couple the blast composer to eval-specific code, even
// though the underlying problem is the same one: RichTextEditor writes
// `value` into Quill via `dangerouslyPasteHTML`, which parses it as HTML, so
// a bare `\n` in plain text collapses under normal HTML whitespace rules the
// moment it's loaded.

const HTML_TAG_PATTERN = /<(p|br|div|ul|ol|li|strong|em|h[1-6])[\s/>]/i;

/** True if `value` already looks like HTML rather than bare plain text. */
export function isLikelyBlastHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

/**
 * Upgrades a plain-text blast body (existing rows, all sent blasts, possibly
 * a live draft) into HTML paragraphs before it's handed to RichTextEditor as
 * `value`, so nothing is lost visually: a blank-line-separated group becomes
 * its own `<p>`, a single newline within a group becomes a `<br>`. Idempotent
 * by design -- a body that already looks like HTML (because it was drafted,
 * polished, or hand-edited since this ticket) is returned unchanged, so
 * re-opening an already-upgraded draft never double-escapes it.
 */
export function upgradeBlastBodyToHtml(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  if (isLikelyBlastHtml(value)) return value;

  // Normalize CRLF / lone CR to `\n` so Windows-origin line endings split
  // into paragraphs and <br> the same as Unix newlines.
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

/**
 * QA fix (LRM-10): decides what a "current content" baseline should become
 * after a programmatic write settles and reports its normalized HTML back
 * (RichTextEditor's onReady). `writtenValue` is the raw string that was
 * asked to load; `normalizedValue` is what the editor actually normalized
 * it to (e.g. Quill rewrites `<ul>` to `<ol data-list="bullet">` with no
 * 'text-change' event at all). Replaces `currentValue` with
 * `normalizedValue` only if `currentValue` still equals `writtenValue` --
 * i.e. nothing (a keystroke) touched it between the write and onReady
 * firing. If it no longer matches, a real edit landed first and must not be
 * clobbered, so `currentValue` is returned unchanged.
 *
 * Was missing for BlastSlot's `editedBody` state (only `lastGeneratedRef`
 * was corrected this way), which meant `editedBody` stayed on the raw
 * pre-normalization string forever, and `shouldConfirmRegenerate`'s
 * `editedBody` vs. `lastGeneratedRef` comparison read every fresh draft
 * with a bullet list as "edited" the instant it loaded.
 */
export function reconcileNormalizedLoad(
  currentValue: string,
  writtenValue: string,
  normalizedValue: string,
): string {
  return currentValue === writtenValue ? normalizedValue : currentValue;
}

/**
 * Whether an HTML blast body has any real text content, as opposed to an
 * empty Quill document -- a blank RichTextEditor's canonical empty value is
 * `<p><br></p>`, not `''`, so a bare `.trim()` (the plain-text-era check)
 * reads it as non-empty and every "there's nothing to send/polish/save"
 * button guard would silently stop working the moment the composer moved to
 * HTML.
 */
export function hasBlastBodyContent(html: string): boolean {
  return html.replace(/<[^>]+>/g, '').trim().length > 0;
}

/**
 * Converts a blast body's HTML into a readable plain-text fallback for the
 * `text:` half of the outbound email (the `html:` half is the sanitized
 * stored body). Mirrored in supabase/functions/lead-week-blast's own copy
 * since Deno can't import from src/ -- keep the two in sync if this changes.
 * Assumes the input is already reduced to the server's allowlist (p, ul, ol,
 * li, strong, em, br); anything else is stripped as plain markup with no
 * special handling.
 */
export function blastHtmlToPlainText(html: string | null | undefined): string {
  if (!html || !html.trim()) return '';

  let text = html
    // List items read as "- " bullet lines, for both bullet and numbered
    // lists -- there is no plain-text numbering to preserve either way.
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    // Block-level boundaries become a blank line (paragraph break); a <br>
    // inside a block becomes a single line break.
    .replace(/<\/(p|div|ul|ol)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Everything else (opening block tags, strong/em) is stripped with no
    // marker -- their text content stays, just unwrapped.
    .replace(/<[^>]+>/g, '');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'");

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
