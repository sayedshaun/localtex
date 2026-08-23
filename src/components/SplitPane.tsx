import { useCallback, useRef, useState } from "react";

export default function SplitPane({
  left,
  right,
  initialLeftPct = 50,
  minPct = 20,
  maxPct = 80,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftPct?: number;
  minPct?: number;
  maxPct?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(initialLeftPct);
  const draggingRef = useRef(false);

  const onMouseDown = useCallback(() => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    let rafId: number | null = null;
    let pendingClientX = 0;

    const applyPending = () => {
      rafId = null;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let pct = ((pendingClientX - rect.left) / rect.width) * 100;
      pct = Math.min(maxPct, Math.max(minPct, pct));
      setLeftPct(pct);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      pendingClientX = e.clientX;
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
  }, [minPct, maxPct]);

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane-left" style={{ width: `${leftPct}%` }}>
        {left}
      </div>
      <div className="split-pane-divider" onMouseDown={onMouseDown} />
      <div className="split-pane-right" style={{ width: `${100 - leftPct}%` }}>
        {right}
      </div>
    </div>
  );
}
