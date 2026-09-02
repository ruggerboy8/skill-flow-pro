import { useEffect, useRef, type MutableRefObject } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

/**
 * Replaces `quill`'s content with `html` without letting the resulting
 * 'text-change' event reach onChange. Sets `suppressChangeRef` true around
 * the write; the 'text-change' handler consumes (resets) that flag itself
 * the moment it fires. The reset here afterward is a safety net for the
 * rare case a write produces no change event at all (e.g. re-pasting
 * already-blank content into an already-blank editor), so the flag can
 * never linger true and accidentally swallow the next real user edit.
 */
function writeContentSilently(
  quill: Quill,
  html: string,
  suppressChangeRef: MutableRefObject<boolean>,
  lastKnownHtmlRef: MutableRefObject<string>
) {
  suppressChangeRef.current = true;
  quill.clipboard.dangerouslyPasteHTML(html);
  lastKnownHtmlRef.current = quill.root.innerHTML;
  suppressChangeRef.current = false;
}

/**
 * CLN-2a: thin wrapper around quill@2 that reproduces the exact prop surface
 * the app's 3 call sites need from react-quill (now removed -- it hard-pins
 * the vulnerable quill@1.3.7 with no fixed release). Quill 2 kept the same
 * core API and "snow" theme, so this owns just the mount/update/destroy
 * lifecycle react-quill used to handle.
 *
 * Behavior preserved from react-quill:
 * - `value`/`onChange` carry HTML strings (`quill.root.innerHTML`), matching
 *   what every caller already stores in the database.
 * - `modules`/`formats` are treated as "structural" config: changing their
 *   *content* re-instantiates the editor (react-quill called these "dirty
 *   props"). Callers may pass a fresh object literal every render (one of
 *   the 3 call sites does) -- config is compared by JSON content, not
 *   reference, so that doesn't cause a rebuild on every keystroke.
 *   NOTE: this means function-valued module config (e.g. custom toolbar
 *   handlers) can't be diffed reliably -- none of the current call sites
 *   pass any, so this is documented rather than solved.
 * - `readOnly` toggles in place via `quill.enable()`/`disable()`.
 *
 * onChange fires ONLY for genuine user edits -- never for mount, and never
 * for a programmatic re-seed when `value` changes externally. This is a
 * deliberate improvement over react-quill, which fired onChange once on
 * mount whenever the raw `value` prop wasn't already byte-identical to
 * Quill's own normalized HTML (true for almost any non-trivial content,
 * and always true for plain text with line breaks, e.g. what
 * format-transcript hands EvaluationHub) -- silently writing re-normalized
 * HTML back out on every panel open. Every content write this component
 * makes itself (initial seed, external value sync) goes through
 * `writeContentSilently`, which sets `suppressChangeRef` around the write
 * so the 'text-change' handler recognizes its own write and swallows it
 * instead of calling `onChange`. Comparing the incoming `value` against
 * `lastKnownHtmlRef` (last-known NORMALIZED html) still decides whether a
 * write is needed at all -- so an external value update that exactly
 * echoes our own last-emitted HTML (the controlled-component round trip)
 * is skipped entirely, preserving cursor position during normal typing.
 */
export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  modules?: Record<string, unknown>;
  formats?: string[];
  readOnly?: boolean;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  modules,
  formats,
  readOnly = false,
  className,
}: RichTextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);

  // Latest onChange, read from inside the Quill event handler, so the
  // handler never needs to be re-bound just because the callback identity
  // changed on a render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Tracks the HTML we last set into (or read out of) the editor, so the
  // controlled-value effect below can tell "the parent echoed our own
  // onChange back as `value`" apart from "the parent changed `value` out
  // from under us" -- same distinction react-quill's shouldComponentUpdate
  // makes.
  const lastKnownHtmlRef = useRef<string>(value);

  // When true, the next 'text-change' event is our own programmatic write
  // (initial seed or an external value sync), not a user edit -- the
  // handler swallows it instead of calling onChange. See the class doc
  // comment above for why this exists.
  const suppressChangeRef = useRef(false);

  const modulesKey = JSON.stringify(modules ?? {});
  const formatsKey = JSON.stringify(formats ?? null);

  // Mount / re-instantiate. Runs once, and again whenever the *content* of
  // modules or formats changes (a toolbar/format change needs a fresh Quill
  // instance -- Quill doesn't support reconfiguring those in place).
  // EvaluationHub actually hits the rebuild path at runtime: its readOnly
  // toggle switches `modules.toolbar` between `false` and a toolbar array,
  // which changes modulesKey and reruns this effect.
  useEffect(() => {
    const host = wrapperRef.current;
    if (!host) return;

    // Quill takes the container element we hand it (a fresh child div, not
    // `host` itself) and inserts its toolbar as a SIBLING of that
    // container -- i.e. as another child of `host`, not a descendant of
    // the container. So the previous instance's teardown (below) can't
    // just remove its own container; it clears the whole host. By the
    // time this line runs, `host` is guaranteed empty (either this is the
    // first mount, or the prior effect's cleanup already cleared it), so a
    // fresh container is all `host` needs.
    const editingArea = document.createElement('div');
    host.appendChild(editingArea);

    const quill = new Quill(editingArea, {
      theme: 'snow',
      modules: modules ?? {},
      formats,
      placeholder,
      readOnly,
    });

    const handleTextChange = () => {
      if (suppressChangeRef.current) {
        suppressChangeRef.current = false;
        lastKnownHtmlRef.current = quill.root.innerHTML;
        return;
      }
      const html = quill.root.innerHTML;
      lastKnownHtmlRef.current = html;
      onChangeRef.current(html);
    };
    quill.on('text-change', handleTextChange);

    // Seed initial content through the same silent path the value-sync
    // effect below uses. Both effects run after this first render (React
    // runs every effect once on mount regardless of dependency arrays), so
    // seeding has to be suppressed here rather than relying on "bind the
    // listener after this line" timing -- the value-sync effect's own
    // comparison (raw `value` vs. Quill's normalized HTML) will almost
    // always disagree on that very first render for non-canonical input,
    // and would otherwise re-paste with the listener already live.
    writeContentSilently(quill, value ?? '', suppressChangeRef, lastKnownHtmlRef);

    quillRef.current = quill;

    return () => {
      quill.off('text-change', handleTextChange);
      quillRef.current = null;
      // Quill has no destroy() API (true in v1 and v2 alike), and its
      // toolbar lives outside the container element we gave it (see
      // above), so unbinding the listener alone leaves DOM behind: a
      // stale, still-interactive .ql-toolbar plus the old container and
      // whatever classes/attributes Quill set on it. Emptying `host`
      // removes all of it regardless of exactly what Quill injected or
      // where, so a rebuild (readOnly toggling `modules.toolbar` between
      // `false` and an array, as EvaluationHub does) or an unmount never
      // leaves residue -- and it leaves `host` empty for the next
      // instantiation's `appendChild` above to build into.
      host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesKey, formatsKey]);

  // Controlled value sync: push external `value` changes into the editor
  // without re-instantiating it and without firing onChange (see class doc
  // comment). Skips the no-op case where `value` is just our own
  // last-emitted HTML coming back through the parent's state.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const nextValue = value ?? '';
    if (nextValue === lastKnownHtmlRef.current) return;
    const selection = quill.getSelection();
    writeContentSilently(quill, nextValue, suppressChangeRef, lastKnownHtmlRef);
    if (selection) {
      const length = quill.getLength();
      const index = Math.max(0, Math.min(selection.index, length - 1));
      quill.setSelection(index, 0, Quill.sources.SILENT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // readOnly toggling in place.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    quill.enable(!readOnly);
  }, [readOnly]);

  // `wrapperRef` is an otherwise-empty host: the effect above populates it
  // imperatively (a fresh container div, plus whatever Quill inserts next
  // to it) and fully empties it on every teardown, so React never needs to
  // reconcile children it didn't render itself.
  return <div ref={wrapperRef} className={className} />;
}
