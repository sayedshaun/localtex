import { useEffect, useRef } from "react";
import { Terminal as XTerm, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function Terminal({
  cwd,
  theme,
}: {
  cwd: string;
  theme: ITheme;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ptyIdRef = useRef<string | null>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      convertEol: true,
      fontSize: 13,
      fontFamily: "Menlo, Consolas, monospace",
      theme,
    });
    termRef.current = term;
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
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  // Re-theme the live terminal in place — switching themes must not kill
  // the running shell session (matches the non-destructive show/hide model).
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme;
  }, [theme]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
