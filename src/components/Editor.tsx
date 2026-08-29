import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView, keymap } from "@codemirror/view";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { undo, redo, toggleComment } from "@codemirror/commands";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { latexCompletions } from "../latex-complete";
import { changeGutter, setBaseline } from "../change-gutter";

// The legacy stex mode has no languageData of its own, so CodeMirror has no
// way to know "%" is the line-comment token — Ctrl+/ (already bound by
// basicSetup's default keymap) would otherwise silently no-op.
const stexLanguage = StreamLanguage.define({
  ...stex,
  languageData: { commentTokens: { line: "%" } },
});

export type EditorHandle = {
  undo: () => void;
  redo: () => void;
  toggleComment: () => void;
  find: () => void;
  insertAtCursor: (text: string) => void;
  goToLine: (line: number) => void;
  getCursorLine: () => number | null;
};

const Editor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    theme: Extension;
    /** File contents at HEAD; null disables the change gutter. */
    baseline?: string | null;
  }
>(function Editor({ value, onChange, theme, baseline }, ref) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  // The baseline lives in editor state, not props, so pushing it is an effect.
  useEffect(() => {
    const view = cmRef.current?.view;
    if (view) view.dispatch({ effects: setBaseline.of(baseline ?? null) });
  }, [baseline]);

  useImperativeHandle(ref, () => ({
    undo: () => {
      const view = cmRef.current?.view;
      if (view) undo(view);
    },
    redo: () => {
      const view = cmRef.current?.view;
      if (view) redo(view);
    },
    toggleComment: () => {
      const view = cmRef.current?.view;
      if (view) toggleComment(view);
    },
    find: () => {
      const view = cmRef.current?.view;
      if (view) openSearchPanel(view);
    },
    insertAtCursor: (text: string) => {
      const view = cmRef.current?.view;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
    goToLine: (line: number) => {
      const view = cmRef.current?.view;
      if (!view) return;
      const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
      const lineInfo = view.state.doc.line(clamped);
      view.dispatch({
        selection: { anchor: lineInfo.from, head: lineInfo.from },
        effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
      });
      view.focus();
    },
    getCursorLine: () => {
      const view = cmRef.current?.view;
      if (!view) return null;
      const pos = view.state.selection.main.head;
      return view.state.doc.lineAt(pos).number;
    },
  }));

  return (
    <CodeMirror
      ref={cmRef}
      className="code-editor"
      value={value}
      height="100%"
      theme={theme}
      extensions={[
        stexLanguage,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        search(),
        // `activateOnTyping` is what makes this Overleaf-like: the panel opens
        // as you type a command rather than only on Ctrl-Space.
        autocompletion({
          override: [latexCompletions],
          activateOnTyping: true,
          closeOnBlur: true,
          maxRenderedOptions: 40,
          icons: false,
        }),
        closeBrackets(),
        changeGutter(),
        // basicSetup already registers searchKeymap/completionKeymap/
        // closeBracketsKeymap, and it sits at higher facet precedence than
        // these extensions, so re-registering them here would be dead weight.
        // Only searchKeymap needs raising: inside basicSetup's single keymap,
        // defaultKeymap's Escape (simplifySelection) is matched before
        // searchKeymap's Escape (closeSearchPanel), so Escape with a match
        // selected collapsed the selection and left the panel open. Prec.high
        // still sits below autocompletion's Prec.highest, so Escape keeps
        // closing the completion panel first.
        Prec.high(keymap.of(searchKeymap)),
      ]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: false,
        closeBrackets: false,
      }}
    />
  );
});

export default Editor;
