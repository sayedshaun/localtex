import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function Terminal({ cwd }: { cwd: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ptyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      convertEol: true,
      fontSize: 13,
      fontFamily: "Menlo, Consolas, monospace",
      theme: { background: "#1e1e1e" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let disposed = false;

    (async () => {
      const id = await window.api.ptySpawn({
        cols: term.cols,
        rows: term.rows,
        cwd,
      });
      if (disposed) {
        await window.api.ptyKill(id);
        return;
      }
      ptyIdRef.current = id;

      unlistenOutput = window.api.onPtyOutput((payload) => {
        if (payload.id !== id) return;
        term.write(payload.data);
      });

      unlistenExit = window.api.onPtyExit((payload) => {
        if (payload.id !== id) return;
        term.write("\r\n[process exited]\r\n");
      });

      term.onData((data) => {
        window.api.ptyWrite(id, data);
      });
    })();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ptyIdRef.current) {
        window.api.ptyResize(ptyIdRef.current, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      unlistenOutput?.();
      unlistenExit?.();
      if (ptyIdRef.current) {
        window.api.ptyKill(ptyIdRef.current);
      }
      term.dispose();
    };
  }, [cwd]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
