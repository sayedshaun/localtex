import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

type PtyOutputPayload = { id: string; data: string };

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
      const id = await invoke<string>("pty_spawn", {
        cols: term.cols,
        rows: term.rows,
        cwd,
      });
      if (disposed) {
        await invoke("pty_kill", { id });
        return;
      }
      ptyIdRef.current = id;

      unlistenOutput = await listen<PtyOutputPayload>("pty-output", (event) => {
        if (event.payload.id !== id) return;
        term.write(base64ToUint8Array(event.payload.data));
      });

      unlistenExit = await listen<{ id: string }>("pty-exit", (event) => {
        if (event.payload.id !== id) return;
        term.write("\r\n[process exited]\r\n");
      });

      term.onData((data) => {
        invoke("pty_write", { id, data });
      });
    })();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ptyIdRef.current) {
        invoke("pty_resize", {
          id: ptyIdRef.current,
          cols: term.cols,
          rows: term.rows,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      unlistenOutput?.();
      unlistenExit?.();
      if (ptyIdRef.current) {
        invoke("pty_kill", { id: ptyIdRef.current });
      }
      term.dispose();
    };
  }, [cwd]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
