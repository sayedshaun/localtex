import { useCallback, useRef, useState } from "react";

export default function SplitPane({
  left,
  right,
  orientation = "horizontal",
  initialLeftPct = 50,
  minPct = 20,
  maxPct = 80,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  orientation?: "horizontal" | "vertical";
  initialLeftPct?: number;
  minPct?: number;
  maxPct?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(initialLeftPct);
  const draggingRef = useRef(false);
  const vertical = orientation === "vertical";

  const onMouseDown = useCallback(() => {
    draggingRef.current = true;
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    let rafId: number | null = null;
    let pendingClientPos = 0;

    const applyPending = () => {
      rafId = null;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let pct = vertical
        ? ((pendingClientPos - rect.top) / rect.height) * 100
        : ((pendingClientPos - rect.left) / rect.width) * 100;
      pct = Math.min(maxPct, Math.max(minPct, pct));
      setLeftPct(pct);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      pendingClientPos = vertical ? e.clientY : e.clientX;
      if (rafId === null) rafId = requestAnimationFrame(applyPending);
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [minPct, maxPct, vertical]);

  return (
    <div className={"split-pane" + (vertical ? " split-pane-column" : "")} ref={containerRef}>
      <div
        className="split-pane-left"
        style={vertical ? { height: `${leftPct}%` } : { width: `${leftPct}%` }}
      >
        {left}
      </div>
      <div
        className={
          "split-pane-divider" + (vertical ? " split-pane-divider-horizontal" : "")
        }
        onMouseDown={onMouseDown}
      />
      <div
        className="split-pane-right"
        style={vertical ? { height: `${100 - leftPct}%` } : { width: `${100 - leftPct}%` }}
      >
        {right}
      </div>
    </div>
  );
}
