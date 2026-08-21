import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

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
  const editingAreaRef = useRef<HTMLDivElement | null>(null);
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

  const modulesKey = JSON.stringify(modules ?? {});
  const formatsKey = JSON.stringify(formats ?? null);

  // Mount / re-instantiate. Runs once, and again whenever the *content* of
  // modules or formats changes (a toolbar/format change needs a fresh Quill
  // instance -- Quill doesn't support reconfiguring those in place).
  useEffect(() => {
    if (!editingAreaRef.current) return;

    const quill = new Quill(editingAreaRef.current, {
      theme: 'snow',
      modules: modules ?? {},
      formats,
      placeholder,
      readOnly,
    });

    quill.clipboard.dangerouslyPasteHTML(value ?? '');
    lastKnownHtmlRef.current = quill.root.innerHTML;

    const handleTextChange = () => {
      const html = quill.root.innerHTML;
      lastKnownHtmlRef.current = html;
      onChangeRef.current(html);
    };
    quill.on('text-change', handleTextChange);

    quillRef.current = quill;

    return () => {
      quill.off('text-change', handleTextChange);
      quillRef.current = null;
      // Quill has no destroy() API (true in v1 and v2 alike) -- react-quill
      // only ever unbound its listener too, relying on React to tear down
      // the DOM. Same here: the editingArea div (and any toolbar Quill
      // inserted as its sibling) live inside wrapperRef, which React
      // unmounts for us.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesKey, formatsKey]);

  // Controlled value sync: push external `value` changes into the editor
  // without re-instantiating it. Skips the no-op case where `value` is just
  // our own last-emitted HTML coming back through the parent's state.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const nextValue = value ?? '';
    if (nextValue === lastKnownHtmlRef.current) return;
    const selection = quill.getSelection();
    quill.clipboard.dangerouslyPasteHTML(nextValue);
    lastKnownHtmlRef.current = quill.root.innerHTML;
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

  return (
    <div ref={wrapperRef} className={className}>
      <div ref={editingAreaRef} />
    </div>
  );
}
