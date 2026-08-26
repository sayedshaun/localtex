import { useEffect, useRef, useState } from "react";

export type PromptRequest = {
  title: string;
  defaultValue?: string;
  confirmLabel?: string;
};

export type PromptState = PromptRequest & {
  resolve: (value: string | null) => void;
};

export default function PromptDialog({
  state,
}: {
  state: PromptState | null;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state) {
      setValue(state.defaultValue ?? "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [state]);

  if (!state) return null;

  function submit() {
    const trimmed = value.trim();
    state!.resolve(trimmed ? trimmed : null);
  }

  function cancel() {
    state!.resolve(null);
  }

  return (
    <div className="modal-overlay" onMouseDown={cancel}>
      <div
        className="modal-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{state.title}</div>
        <input
          ref={inputRef}
          className="modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
        />
        <div className="modal-actions">
          <button className="modal-btn" onClick={cancel}>
            Cancel
          </button>
          <button className="modal-btn modal-btn-primary" onClick={submit}>
            {state.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
