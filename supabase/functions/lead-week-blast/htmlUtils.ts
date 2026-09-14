// LRM-10: server-side HTML handling for the doctor blast pipeline. Deno
// cannot import from src/, so this is a deliberate, minimal local copy --
// see src/lib/leadWeekBlastHtml.ts for the client-side mirror of
// blastHtmlToPlainText (kept in sync by hand if this changes).

const HTML_TAG_PATTERN = /<(p|br|div|ul|ol|li|strong|em|h[1-6])[\s/>]/i;

/**
 * Upgrades a plain-text blast body -- every row predating this ticket,
 * which includes every already-sent blast and possibly a live draft never
 * re-opened in the new editor -- into HTML paragraphs before it's sanitized
 * and sent as an email. Without this, an old draft sent without ever being
 * touched in the editor would go out with its `html:` part equal to raw
 * plain text: bare `\n` means nothing in HTML, so every line break in the
 * email would collapse. Idempotent: a body that's already HTML is returned
 * unchanged. Mirrors src/lib/leadWeekBlastHtml.ts's upgradeBlastBodyToHtml.
 */
export function upgradeBlastBodyToHtml(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  if (HTML_TAG_PATTERN.test(value)) return value;

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
 * The composer's toolbar (RichTextEditor in BlastSlot) only offers bold,
 * italic, and bulleted/numbered lists, so these are the only tags the blast
 * pipeline should ever need. Applied to handleDraft/handlePolish output
 * before it's returned to the client, and to a stored body again right
 * before it's used to build an outbound email -- belt and braces, since a
 * model can ignore its prompt's own formatting instructions, and a stored
 * row can predate this sanitizer entirely.
 */
const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);

/**
 * Reduces `html` to the allowlist above: every other tag is stripped
 * (unwrapped -- its own text content survives, just without the tag), every
 * attribute on a kept tag is dropped, and <script>/<style> are removed
 * together with their content since that content should never survive into
 * rendered or emailed output. Deliberately not a full HTML parser: this is a
 * small, deterministic set of text substitutions, not a dependency.
 *
 * QA fix: the tag-matching regex used to scan for attributes with `[^>]*`,
 * which does not stop at a `<`. An unclosed/malformed fragment (no closing
 * `>` of its own, e.g. `<img src=x onerror=alert(1)` with the bracket
 * missing) either survived untouched (no `>` anywhere later in the string
 * to close the match) or, worse, reached forward and grabbed the NEXT real
 * tag's `>` as its own -- swallowing that legitimate tag's opening bracket
 * along with the malicious fragment. `[^<>]*` stops the match at the next
 * `<`, so a malformed tag can never consume a subsequent real one. The
 * trailing pass below is the second half of the fix: it escapes any `<`
 * that survives without starting one of the allowlisted tags (a real
 * unclosed fragment, once it can no longer swallow anything, still needs
 * this step to be reduced to inert text instead of passing through as-is).
 */
export function sanitizeBlastHtml(html: string | null | undefined): string {
  if (!html) return '';

  let out = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (tag === 'br') return '<br>';
    const isClosing = match.startsWith('</');
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  // Any `<` still standing at this point is either a genuine unclosed/
  // malformed fragment or stray text that merely looks like the start of a
  // tag -- neither should reach the client or an email as a live `<`.
  out = out.replace(/<(?!\/?(?:p|ul|ol|li|strong|em|br)\b)/gi, '&lt;');

  return out;
}

/**
 * Whether an HTML blast body has any real text content, as opposed to an
 * empty Quill document (`<p><br></p>` for a blank editor) -- a bare
 * `.trim()` on that string is always truthy, since it has no leading/
 * trailing whitespace to strip. Mirrors src/lib/leadWeekBlastHtml.ts's
 * hasBlastBodyContent.
 */
export function hasVisibleText(html: string | null | undefined): boolean {
  return !!html && html.replace(/<[^>]+>/g, '').trim().length > 0;
}

/**
 * Converts sanitized blast HTML into a readable plain-text fallback for the
 * `text:` half of the outbound email (the `html:` half is the sanitized
 * body itself). Assumes the input is already reduced to the allowlist above;
 * anything else surviving in it is stripped as plain markup with no special
 * handling.
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
