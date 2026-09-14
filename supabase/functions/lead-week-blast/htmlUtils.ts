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
 * Codex review (PR #116, P2): Quill 2 serializes EVERY list -- bullet or
 * ordered -- as an `<ol>`, distinguishing them only with `data-list="bullet"`
 * / `data-list="ordered"` on each `<li>` (verified against RichTextEditor's
 * own test suite: `<ul><li>` round-trips through Quill as
 * `<ol><li data-list="bullet">`). The server/client sanitizers strip ALL
 * attributes from every kept tag, `data-list` included, so a user-edited
 * bulleted draft was surviving sanitization as a bare `<ol><li>` -- a doctor
 * received a NUMBERED list for what she wrote as bullets. This restores the
 * semantic tag (`<ul>` for a bullet-flavored run, `<ol>` for an
 * ordered/unflavored one) before that attribute-stripping pass ever runs, so
 * the flavor survives as the tag itself instead of an attribute that gets
 * thrown away.
 *
 * A `<li>` with no `data-list` attribute at all (hand-authored or
 * model-produced HTML that never touched Quill, e.g. handleDraft/
 * handlePolish's own output) is treated as matching its container: bullet
 * inside a `<ul>`, ordered inside an `<ol>` -- so this is a no-op for HTML
 * that was already semantically correct.
 *
 * Quill's mixed case: back-to-back bullet and ordered lists in the editor
 * collapse into a SINGLE `<ol>` holding both flavors of `<li>` (also
 * verified against the same test fixtures). Splitting is conservative and
 * order-preserving: each maximal run of same-flavor `<li>`s inside one list
 * block becomes its own `<ul>`/`<ol>`, in the order the items appeared --
 * never merged back into one list, never re-sorted by flavor. A caller
 * mixing bullet and ordered items back to back gets two adjacent lists on
 * render, which matches what she actually typed.
 *
 * Deliberately regex-based, matching sanitizeBlastHtml's own approach,
 * rather than a DOM parser -- Deno has no DOM available here, and this needs
 * to behave identically to its client-side mirror (see
 * src/lib/leadWeekBlastHtml.ts's convertQuillListFlavors -- keep the two in
 * sync by hand if this changes). This assumes list blocks are not nested,
 * which holds for every list this app's composer can produce: its toolbar
 * only exposes the top-level bullet/ordered buttons, no indent/nesting
 * control.
 */
export function convertQuillListFlavors(html: string | null | undefined): string {
  if (!html) return '';

  return html.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (whole, containerTag: string, inner: string) => {
    const items: { flavor: 'bullet' | 'ordered'; content: string }[] = [];
    const liPattern = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liPattern.exec(inner)) !== null) {
      const [, attrs, content] = liMatch;
      const dataListMatch = /data-list\s*=\s*["']?(bullet|ordered)["']?/i.exec(attrs);
      const flavor = dataListMatch
        ? (dataListMatch[1].toLowerCase() as 'bullet' | 'ordered')
        : (containerTag.toLowerCase() === 'ul' ? 'bullet' : 'ordered');
      items.push({ flavor, content });
    }
    // Nothing recognizable as a list item inside -- leave the original
    // markup untouched rather than guessing.
    if (items.length === 0) return whole;

    const runs: { flavor: 'bullet' | 'ordered'; items: string[] }[] = [];
    for (const item of items) {
      const currentRun = runs[runs.length - 1];
      if (currentRun && currentRun.flavor === item.flavor) {
        currentRun.items.push(item.content);
      } else {
        runs.push({ flavor: item.flavor, items: [item.content] });
      }
    }

    return runs
      .map((run) => {
        const tag = run.flavor === 'bullet' ? 'ul' : 'ol';
        const lis = run.items.map((content) => `<li>${content}</li>`).join('');
        return `<${tag}>${lis}</${tag}>`;
      })
      .join('');
  });
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
 * QA fix #2: the exact, closed set of strings the main pass below can ever
 * emit for a kept tag -- bare tag name, no attributes, always lowercase, `br`
 * always self-normalized to this one form (never a separate closing variant).
 * This is the single source of truth for "what does a legitimate tag look
 * like in our output", used both by the final escape pass's lookahead and by
 * this file's own tests (a structural invariant: every `<` in sanitized
 * output must begin one of these exact literals). If the main pass's
 * emission logic ever changes, update this list and the lookahead below
 * together.
 */
export const CANONICAL_BLAST_TAGS = [
  '<p>', '</p>', '<ul>', '</ul>', '<ol>', '</ol>', '<li>', '</li>',
  '<strong>', '</strong>', '<em>', '</em>', '<br>',
] as const;

/**
 * Reduces `html` to the allowlist above: every other tag is stripped
 * (unwrapped -- its own text content survives, just without the tag), every
 * attribute on a kept tag is dropped, and <script>/<style> are removed
 * together with their content since that content should never survive into
 * rendered or emailed output. Deliberately not a full HTML parser: this is a
 * small, deterministic set of text substitutions, not a dependency.
 *
 * QA fix #1: the tag-matching regex used to scan for attributes with
 * `[^>]*`, which does not stop at a `<`. An unclosed/malformed fragment (no
 * closing `>` of its own, e.g. `<img src=x onerror=alert(1)` with the
 * bracket missing) either survived untouched (no `>` anywhere later in the
 * string to close the match) or, worse, reached forward and grabbed the NEXT
 * real tag's `>` as its own -- swallowing that legitimate tag's opening
 * bracket along with the malicious fragment. `[^<>]*` stops the match at the
 * next `<`, so a malformed tag can never consume a subsequent real one.
 *
 * QA fix #2: the trailing escape pass originally checked only that a `<` was
 * followed by an allowlisted tag NAME plus a word boundary (`\b`). A word
 * boundary matches after a space just as well as after `>`, so
 * `<strong onclick=alert(1) ` (tag name, then a space, then attributes)
 * satisfied the lookahead and the `<` was never escaped -- the attribute
 * text survived untouched and jsdom (and a real mail client) parsed it as a
 * live `onclick`.
 *
 * The output is now a CLOSED ALPHABET instead: the main pass above only
 * ever re-emits an allowed tag as one of the exact bare strings in
 * CANONICAL_BLAST_TAGS, with no attributes. So the lookahead requires the
 * exact closing `>` immediately after the tag name (or, for `br`, the exact
 * literal `br>`, since `br` never gets a separate closing form) -- not just
 * a word boundary. A malformed fragment like `<strong onclick=...` has a
 * space right after the tag name, fails this exact match, and gets escaped
 * whole: attributes and all, since nothing between an escaped `<` and the
 * next real `<` (or the end of the string) can ever be re-interpreted as
 * "inside a legitimate tag" again.
 */
export function sanitizeBlastHtml(html: string | null | undefined): string {
  if (!html) return '';

  // Restore semantic <ul>/<ol> from Quill's data-list-flavored <li>s BEFORE
  // the attribute-stripping pass below, which would otherwise throw the
  // flavor away and leave every bullet list looking numbered. See
  // convertQuillListFlavors's own doc comment for the full story.
  let out = convertQuillListFlavors(html)
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

  // Any `<` still standing at this point must begin one of the exact
  // canonical literals above (an optional `/` then one of p/ul/ol/li/
  // strong/em immediately followed by `>`, or the literal `br>` with no
  // slash form) or it gets escaped whole -- no attribute-bearing or
  // otherwise malformed fragment can survive, because nothing except an
  // immediate `>` after the tag name satisfies the lookahead.
  out = out.replace(/<(?!\/?(?:p|ul|ol|li|strong|em)>|br>)/gi, '&lt;');

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
