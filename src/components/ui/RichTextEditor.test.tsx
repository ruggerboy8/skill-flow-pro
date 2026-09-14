import { useEffect, useRef, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';
import { reconcileNormalizedLoad } from '@/lib/leadWeekBlastHtml';

// Reaches the live Quill instance the way the wrapper itself does, so tests
// can drive "user typing" through Quill's own API -- jsdom doesn't run a
// real contentEditable input pipeline, so dispatching raw DOM events isn't
// reliable, but this still exercises the same 'text-change' listener the
// wrapper wires onChange through.
async function findQuillInstance(editorEl: HTMLElement) {
  const quillContainer = editorEl.closest('.ql-container') as HTMLElement;
  const { default: Quill } = await import('quill');
  return Quill.find(quillContainer) as InstanceType<typeof Quill>;
}

// CLN-2a: react-quill (hard-pinned to vulnerable quill@1.3.7, no fixed
// release) was replaced with this thin wrapper around quill@2 directly. The
// 3 call sites (MarkdownPreview, DirectorPrepComposer, EvaluationHub) all
// store/render Quill's output as an HTML string, so the behavior this test
// pins is: the editor initializes, renders a toolbar + editable area, seeds
// itself from `value`, and reports edits back as HTML via `onChange`.

afterEach(cleanup);

describe('RichTextEditor', () => {
  it('initializes with a toolbar and an editable area seeded from value', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value="<p>hello world</p>"
        onChange={onChange}
        modules={{ toolbar: [['bold', 'italic'], ['clean']] }}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.ql-toolbar')).not.toBeNull();
      expect(container.querySelector('.ql-editor')).not.toBeNull();
    });

    const editor = container.querySelector('.ql-editor') as HTMLElement;
    expect(editor.textContent).toBe('hello world');
  });

  it('fires onChange with HTML when the editor content changes', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor value="" onChange={onChange} modules={{ toolbar: false }} />
    );

    const editor = await waitFor(() => {
      const el = container.querySelector('.ql-editor') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    const instance = await findQuillInstance(editor);
    expect(instance).toBeTruthy();
    instance.setText('typed content');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const lastHtml = onChange.mock.calls.at(-1)?.[0];
    expect(lastHtml).toContain('typed content');
  });

  it('does not re-instantiate the editor when a caller passes a fresh modules object literal every render', async () => {
    const onChange = vi.fn();
    function Harness({ value }: { value: string }) {
      // A new object literal every render, deliberately -- this mirrors
      // DirectorPrepComposer.tsx, which builds `quillModules` inline in its
      // render body rather than hoisting/memoizing it.
      return (
        <RichTextEditor
          value={value}
          onChange={onChange}
          modules={{ toolbar: [['bold'], ['clean']] }}
        />
      );
    }
    const { container, rerender } = render(<Harness value="<p>a</p>" />);
    await waitFor(() => {
      expect(container.querySelector('.ql-editor')).not.toBeNull();
    });
    const editorBefore = container.querySelector('.ql-editor');

    rerender(<Harness value="<p>a</p>" />);
    rerender(<Harness value="<p>a</p>" />);

    const editorAfter = container.querySelector('.ql-editor');
    expect(editorAfter).toBe(editorBefore);
  });

  it('toggles readOnly in place without swapping the editor instance', async () => {
    const onChange = vi.fn();
    function Harness({ readOnly }: { readOnly: boolean }) {
      return <RichTextEditor value="<p>a</p>" onChange={onChange} readOnly={readOnly} />;
    }
    const { container, rerender } = render(<Harness readOnly={false} />);
    await waitFor(() => {
      expect(container.querySelector('.ql-editor')).not.toBeNull();
    });
    const editorBefore = container.querySelector('.ql-editor') as HTMLElement;
    expect(editorBefore.getAttribute('contenteditable')).toBe('true');

    rerender(<Harness readOnly={true} />);

    await waitFor(() => {
      expect(editorBefore.getAttribute('contenteditable')).toBe('false');
    });
    expect(container.querySelector('.ql-editor')).toBe(editorBefore);
  });

  // QA (CLN-2a follow-up): react-quill fired onChange once on mount whenever
  // the raw `value` prop wasn't byte-identical to Quill's own normalized
  // HTML -- true for almost any non-canonical input, and always true for
  // plain text with line breaks (what format-transcript hands
  // EvaluationHub). That silently wrote re-normalized HTML back to the DB
  // on every panel open. The wrapper now suppresses onChange around every
  // write it makes itself (see writeContentSilently), so this must stay at
  // zero regardless of how far `value` is from Quill's canonical HTML shape.
  it('fires zero onChange calls mounting with non-canonical plain-text, multi-line content', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor value={'Line one.\nLine two.'} onChange={onChange} modules={{ toolbar: false }} />
    );

    await waitFor(() => {
      const editor = container.querySelector('.ql-editor') as HTMLElement | null;
      expect(editor).not.toBeNull();
      expect(editor?.textContent).toContain('Line one.');
    });

    // Let any pending microtasks/effects settle before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires zero onChange calls for a programmatic value-prop update, but fires normally for a real user edit after it', async () => {
    const onChange = vi.fn();
    // Mirrors every real call site: onChange result gets written straight
    // back in as the next `value` (the controlled-component round trip).
    function Harness({ externalValue }: { externalValue: string }) {
      const [value, setValue] = useState(externalValue);
      // Simulates the parent's own data arriving asynchronously (e.g. a
      // Supabase query resolving after mount) and being passed down as a
      // new controlled `value`.
      useEffect(() => {
        setValue(externalValue);
      }, [externalValue]);
      return (
        <RichTextEditor
          value={value}
          onChange={(html) => {
            onChange(html);
            setValue(html);
          }}
          modules={{ toolbar: false }}
        />
      );
    }

    const { container, rerender } = render(<Harness externalValue="" />);
    await waitFor(() => {
      expect(container.querySelector('.ql-editor')).not.toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();

    // Async value load: a real, non-canonical (plain text, multi-line)
    // value arrives after mount, same shape format-transcript produces.
    rerender(<Harness externalValue={'Line one.\nLine two.'} />);
    await waitFor(() => {
      const editor = container.querySelector('.ql-editor') as HTMLElement;
      expect(editor.textContent).toContain('Line one.');
    });
    expect(onChange).not.toHaveBeenCalled();

    // A genuine user edit, driven through Quill's own API (see
    // findQuillInstance) -- this must fire onChange normally.
    const editorEl = container.querySelector('.ql-editor') as HTMLElement;
    const instance = await findQuillInstance(editorEl);
    instance.setText('User typed this.');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
    const editedHtml = onChange.mock.calls[0][0];
    expect(editedHtml).toContain('User typed this.');

    // Parent echo: onChange's own handler above already fed the edited HTML
    // back in as `value` (React state update, already flushed by the
    // `waitFor` above). That round trip must not cause a second onChange
    // call, and must not stomp the just-typed content back out.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((container.querySelector('.ql-editor') as HTMLElement).textContent).toContain(
      'User typed this.'
    );
  });

  // Codex review (CLN-2a follow-up, PR #73): changing `modules`/`formats`
  // rebuilds the editor on the same host node. Quill inserts its toolbar as
  // a SIBLING of the container element it's given, not a descendant, so a
  // teardown that only unbound the 'text-change' listener left the old
  // .ql-toolbar (still interactive) behind every time -- duplicate toolbar
  // DOM accumulating on every rebuild. EvaluationHub hits this at runtime:
  // its readOnly toggle switches `modules.toolbar` between `false` and a
  // toolbar array, rebuilding the editor each time.
  it('never accumulates .ql-toolbar DOM across a modules/readOnly-driven rebuild', async () => {
    const onChange = vi.fn();
    function Harness({ isReadOnly }: { isReadOnly: boolean }) {
      return (
        <RichTextEditor
          value="<p>a</p>"
          onChange={onChange}
          readOnly={isReadOnly}
          // Mirrors EvaluationHub's actual config exactly: readOnly flips
          // modules.toolbar between `false` and a real toolbar array.
          modules={{
            toolbar: isReadOnly ? false : [['bold', 'italic'], [{ list: 'bullet' }], ['clean']],
          }}
        />
      );
    }

    const { container, rerender } = render(<Harness isReadOnly={false} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.ql-toolbar')).toHaveLength(1);
    });
    expect(container.querySelectorAll('.ql-container')).toHaveLength(1);

    // toolbar config A -> config B (readOnly on): forces a rebuild on the
    // same host. This is the exact path that used to leak the old toolbar.
    rerender(<Harness isReadOnly={true} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.ql-toolbar')).toHaveLength(0);
    });
    expect(container.querySelectorAll('.ql-container')).toHaveLength(1);

    // Toggle back to config A: if either rebuild leaked DOM, this is where
    // it would show up as more than one toolbar or container.
    rerender(<Harness isReadOnly={false} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.ql-toolbar')).toHaveLength(1);
    });
    expect(container.querySelectorAll('.ql-container')).toHaveLength(1);

    // Cycle through both states once more for good measure.
    rerender(<Harness isReadOnly={true} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.ql-toolbar')).toHaveLength(0);
    });
    rerender(<Harness isReadOnly={false} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.ql-toolbar')).toHaveLength(1);
    });
    expect(container.querySelectorAll('.ql-container')).toHaveLength(1);
  });

  // LRM-10: onReady exposes Quill's normalized HTML for a silent
  // (non-user) write, without ever standing in for onChange. Needed because
  // Quill can rewrite structural markup on load (e.g. `<ul>` -> `<ol
  // data-list="bullet">`) with no 'text-change' event at all, so a caller
  // that needs to compare "has this changed since it loaded" needs a
  // normalized baseline that onChange alone never provides for a load.
  it('fires onReady (not onChange) with Quill-normalized HTML on initial mount', async () => {
    const onChange = vi.fn();
    const onReady = vi.fn();
    const { container } = render(
      <RichTextEditor
        value="<ul><li>One</li><li>Two</li></ul>"
        onChange={onChange}
        onReady={onReady}
        modules={{ toolbar: false }}
      />
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
    expect(onChange).not.toHaveBeenCalled();
    const normalized = onReady.mock.calls.at(-1)?.[0];
    expect(normalized).toContain('One');
    expect(normalized).toContain('Two');
    // Pin the actual observed Quill rewrite so a future Quill upgrade that
    // changes this normalization is caught here, not as a mystery bug in a
    // caller relying on onReady for a stale-edit baseline.
    expect(normalized).toContain('data-list="bullet"');

    const editor = container.querySelector('.ql-editor') as HTMLElement;
    expect(editor.innerHTML).toBe(normalized);
  });

  it('fires onReady again for an external value-prop change, still without onChange', async () => {
    const onChange = vi.fn();
    const onReady = vi.fn();
    function Harness({ value }: { value: string }) {
      return (
        <RichTextEditor
          value={value}
          onChange={onChange}
          onReady={onReady}
          modules={{ toolbar: false }}
        />
      );
    }
    const { rerender } = render(<Harness value="<p>First</p>" />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    rerender(<Harness value="<p>Second</p>" />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    expect(onChange).not.toHaveBeenCalled();
    expect(onReady.mock.calls[1][0]).toContain('Second');
  });

  it('does not require onReady -- existing callers that omit it are unaffected', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor value="<p>a</p>" onChange={onChange} modules={{ toolbar: false }} />
    );
    await waitFor(() => {
      expect(container.querySelector('.ql-editor')).not.toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  // QA fix (LRM-10): pins the actual bug -- BlastSlot keeps two baselines
  // (its visible "current content" state and a "last generated" ref) that
  // both need to end up on the SAME normalized string after a programmatic
  // load, using reconcileNormalizedLoad's guard (only overwrite the content
  // baseline if nothing touched it since the write). The original fix only
  // corrected one of the two baselines from onReady, so they silently
  // diverged on every load that Quill normalizes (e.g. <ul> -> <ol
  // data-list="bullet">), producing a false "you have unsaved edits"
  // reading forever after. This models BlastSlot's exact wiring: a content
  // ref and a generated-baseline ref, both fed from the same onReady call.
  it('lets a caller keep a content baseline and a generated baseline equal to the normalized load, not the raw value it wrote', async () => {
    const writtenValue = '<ul><li>One</li></ul>';
    const contentRef = { current: writtenValue };
    const lastGeneratedRef = { current: '' };

    render(
      <RichTextEditor
        value={writtenValue}
        onChange={() => {}}
        onReady={(html) => {
          lastGeneratedRef.current = html;
          contentRef.current = reconcileNormalizedLoad(contentRef.current, writtenValue, html);
        }}
        modules={{ toolbar: false }}
      />
    );

    await waitFor(() => {
      expect(lastGeneratedRef.current).toContain('data-list="bullet"');
    });
    // Quill actually rewrote the markup -- if it hadn't, this test would
    // prove nothing.
    expect(lastGeneratedRef.current).not.toBe(writtenValue);
    // Both baselines land on the exact same normalized string, so a
    // same-content comparison (shouldConfirmRegenerate) reads "unchanged".
    expect(contentRef.current).toBe(lastGeneratedRef.current);
  });

  // Codex review (PR #116, P2): pins the mount-ordering bug in BlastSlot's
  // "pending sync" gate, which the test above doesn't model -- that one
  // reconciles unconditionally on every onReady call, but BlastSlot only
  // consumes onReady ONCE, guarded by a flag, so it can safely ignore an
  // onReady it didn't ask for (Polish's, deliberately left unarmed -- see
  // MeetingsAndFocusTab.tsx's onPolishClick). The bug: a CHILD component's
  // own mount effect runs BEFORE the parent's (React commits child effects
  // bottom-up), so a parent that arms this flag from its OWN effect (not
  // render) sees the initial onReady arrive already-unarmed and misses it --
  // the flag then stays armed for whatever onReady fires NEXT, wrongly
  // adopting a later, unrelated write (e.g. a Polish result) as the
  // "generated" baseline. The fix: arm the flag with useRef's INITIAL value,
  // set during render, before the child ever mounts.
  function ArmBeforeMountHarness({
    initial,
    polishText,
    onSettled,
  }: {
    initial: string;
    polishText?: string;
    onSettled: (state: { editedBody: string; lastGenerated: string }) => void;
  }) {
    const [editedBody, setEditedBody] = useState(initial);
    const lastGeneratedRef = useRef('');
    // The fix under test: armed from render, not from an effect.
    const pendingGeneratedSyncRef = useRef(true);
    const pendingWrittenValueRef = useRef(initial);

    const onReady = (html: string) => {
      if (pendingGeneratedSyncRef.current) {
        pendingGeneratedSyncRef.current = false;
        lastGeneratedRef.current = html;
        setEditedBody((current) => reconcileNormalizedLoad(current, pendingWrittenValueRef.current, html));
      }
    };

    // Stand-in for onPolishClick: sets editedBody directly, deliberately
    // WITHOUT arming pendingGeneratedSyncRef -- lastGeneratedRef must stay
    // on the pre-polish baseline.
    useEffect(() => {
      if (polishText !== undefined) setEditedBody(polishText);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [polishText]);

    useEffect(() => {
      onSettled({ editedBody, lastGenerated: lastGeneratedRef.current });
    });

    return <RichTextEditor value={editedBody} onChange={setEditedBody} onReady={onReady} modules={{ toolbar: false }} />;
  }

  it('arms the pending-sync flag from render so the initial mount onReady is consumed, not a later Polish-like write', async () => {
    const writtenValue = '<ul><li>One</li></ul>';
    let latest = { editedBody: '', lastGenerated: '' };
    const { rerender } = render(
      <ArmBeforeMountHarness initial={writtenValue} onSettled={(s) => { latest = s; }} />
    );

    await waitFor(() => {
      expect(latest.lastGenerated).toContain('data-list="bullet"');
    });
    // The initial onReady was consumed -- both baselines normalized and
    // equal to each other, not the raw written value.
    expect(latest.editedBody).toBe(latest.lastGenerated);
    const normalizedBaseline = latest.lastGenerated;

    // Same component instance (rerender, not remount) receives a
    // Polish-like update next.
    rerender(
      <ArmBeforeMountHarness initial={writtenValue} polishText="<p>Polished</p>" onSettled={(s) => { latest = s; }} />
    );

    await waitFor(() => {
      expect(latest.editedBody).toBe('<p>Polished</p>');
    });
    // The already-consumed flag must not reawaken for this write --
    // lastGeneratedRef stays on the pre-polish, normalized baseline, so a
    // subsequent Regenerate still warns that the polish result will be lost.
    expect(latest.lastGenerated).toBe(normalizedBaseline);
  });
});
