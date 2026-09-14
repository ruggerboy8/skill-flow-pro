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
 * QA finding (PR #116): the flavor lookup used to match `data-list=...`
 * anywhere in the li's attribute string, with no requirement that it
 * actually START an attribute. `<li title="data-list=ordered"
 * data-list="bullet">` has that shape inside the (unrelated) title
 * attribute's VALUE, and the old regex happily matched that decoy
 * substring first, misreading a bullet item as ordered. Real HTML
 * attributes are always preceded by whitespace, so the lookup now requires
 * a leading `\s` before `data-list` -- a decoy sitting inside a quoted
 * attribute VALUE is preceded by a quote character, not whitespace, and no
 * longer matches. The attrs string is prefixed with a space before
 * matching so this holds even in the edge case where `data-list` is the
 * very first (and only) attribute with no leading space of its own.
 *
 * Deliberately regex-based, matching sanitizeBlastHtml's own approach,
 * rather than a DOM parser -- Deno's copy of this function (see
 * supabase/functions/lead-week-blast/htmlUtils.ts) has no DOM available, and
 * the two copies need to behave identically. This assumes list blocks are
 * not nested, which holds for every list this app's composer can produce:
 * its toolbar only exposes the top-level bullet/ordered buttons, no
 * indent/nesting control.
 */
export function convertQuillListFlavors(html: string | null | undefined): string {
  if (!html) return '';

  return html.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (whole, containerTag: string, inner: string) => {
    const items: { flavor: 'bullet' | 'ordered'; content: string }[] = [];
    const liPattern = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liPattern.exec(inner)) !== null) {
      const [, attrs, content] = liMatch;
      const dataListMatch = /\sdata-list\s*=\s*["']?(bullet|ordered)["']?/i.exec(' ' + attrs);
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
 * blast-send-trap incident: whether the editor's current content needs to be
 * persisted before Send / Test-send fire. Before this, the editor was local
 * state persisted only by an explicit "Save draft" click, while the send
 * paths read `body` (and `subject`) straight from the DB row -- a user could
 * edit, click Send, and have the STALE saved draft go out instead of what
 * was on her screen. That happened live: 16 doctors got the pre-edit AI
 * draft.
 *
 * QA follow-up: the first version of this only compared body. The review
 * dialog renders `subject={editedSubject}` (the live input) while the send
 * itself reads the DB row's subject, so a SUBJECT-only edit reproduced the
 * exact same incident class -- the dialog previews the new subject, the
 * email goes out with the old one. Both fields she can see and edit are now
 * covered, and the caller must persist BOTH `editedBody` and `editedSubject`
 * verbatim when this returns true (not `weekBlast.subject`, unlike the
 * Polish/Regenerate save-body calls -- see BlastSlot's onSendClick /
 * onTestSendClick comment for why the send path's contract is different).
 *
 * `editedBody` is Quill-normalized HTML (see RichTextEditor / BlastSlot's
 * onEditorReady); `savedBody` is the raw stored row, which can still be
 * pre-normalization (or plain text, for a row predating LRM-10) even when
 * the user hasn't touched a single character since loading it. A strict
 * inequality therefore also returns true on some sends where nothing
 * actually changed -- accepted deliberately: that extra save is idempotent
 * and harmless, while a normalization-aware comparison risks the one
 * failure mode that actually matters here, ruling out a save that should
 * have happened for a real edit. When in doubt, save.
 *
 * Subject gets one deliberate exception to that "when in doubt, save"
 * stance, because it's not ambiguous the way Quill normalization is: when
 * the saved row's subject is empty, BOTH the client (editedSubject's own
 * `useState` initializer) and the send edge function fall back to the exact
 * same computed default (`buildDefaultBlastSubject` /
 * `buildDefaultSubject`, kept in sync by hand -- see either's doc comment).
 * So if `editedSubject` still equals that default and nothing else changed,
 * skipping the save is provably correct: the email would go out with that
 * same default subject whether or not this saves. `defaultSubject` is the
 * caller's already-computed `buildDefaultBlastSubject(weekStartDate)`,
 * passed in rather than imported here to avoid a circular import with
 * src/lib/leadWeekBlasts.ts (which already imports from this file). If the
 * saved subject is empty AND editedSubject differs from that default, that
 * is a real, savable edit (she typed something other than the default), so
 * this still returns true.
 */
export function needsSaveBeforeSend(
  editedBody: string,
  editedSubject: string,
  savedBody: string | null | undefined,
  savedSubject: string | null | undefined,
  defaultSubject: string,
): boolean {
  if (editedBody !== (savedBody ?? '')) return true;
  // Mirrors the send edge function's own fallback formula exactly:
  // `(blastRow.subject && blastRow.subject.trim()) || buildDefaultSubject(...)`.
  const effectiveSavedSubject = savedSubject && savedSubject.trim() ? savedSubject : defaultSubject;
  return editedSubject !== effectiveSavedSubject;
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
