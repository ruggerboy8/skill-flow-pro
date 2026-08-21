import { useEffect, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';

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
});
