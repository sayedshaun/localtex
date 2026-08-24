import { forwardRef, useImperativeHandle, useRef } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView, keymap } from "@codemirror/view";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { undo, redo } from "@codemirror/commands";

const stexLanguage = StreamLanguage.define(stex);

export type EditorHandle = {
  undo: () => void;
  redo: () => void;
  find: () => void;
  insertAtCursor: (text: string) => void;
};

const Editor = forwardRef<
  EditorHandle,
  { value: string; onChange: (value: string) => void }
>(function Editor({ value, onChange }, ref) {
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
  }));

  return (
    <CodeMirror
      ref={cmRef}
      className="code-editor"
      value={value}
      height="100%"
      theme="dark"
      extensions={[
        stexLanguage,
        EditorView.lineWrapping,
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
