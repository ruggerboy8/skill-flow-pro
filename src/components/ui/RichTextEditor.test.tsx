import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';

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

    // Simulate a user edit the way Quill itself would apply one: through its
    // own API rather than firing raw DOM events, since jsdom doesn't run a
    // real contentEditable input pipeline. This still exercises the same
    // 'text-change' listener the wrapper wires onChange through.
    const quillContainer = editor.closest('.ql-container') as HTMLElement;
    expect(quillContainer).not.toBeNull();

    // Reach the Quill instance the way the wrapper does: via Quill.find on
    // the container's registered instance is private, so instead we assert
    // through the public contract -- typing is simulated by dispatching an
    // input event isn't reliable in jsdom for contentEditable, so we drive
    // it through Quill's documented API surface instead.
    const { default: Quill } = await import('quill');
    const instance = Quill.find(quillContainer) as InstanceType<typeof Quill>;
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
});
