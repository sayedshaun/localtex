import { forwardRef, useImperativeHandle, useRef } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView, keymap } from "@codemirror/view";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { undo, redo } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";

const stexLanguage = StreamLanguage.define(stex);

export type EditorHandle = {
  undo: () => void;
  redo: () => void;
  find: () => void;
  insertAtCursor: (text: string) => void;
  goToLine: (line: number) => void;
  getCursorLine: () => number | null;
};

const Editor = forwardRef<
  EditorHandle,
  { value: string; onChange: (value: string) => void; theme: Extension }
>(function Editor({ value, onChange, theme }, ref) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(ref, () => ({
    undo: () => {
      const view = cmRef.current?.view;
      if (view) undo(view);
    },
    redo: () => {
      const view = cmRef.current?.view;
      if (view) redo(view);
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
        keymap.of(searchKeymap),
      ]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
      }}
    />
  );
});

export default Editor;
