import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { EditorHandle } from "./components/Editor";
import Terminal from "./components/Terminal";
import PdfPreview, { PdfPreviewHandle } from "./components/PdfPreview";
import FileTree from "./components/FileTree";
import OutlinePanel from "./components/OutlinePanel";
import SymbolToolbar from "./components/SymbolToolbar";
import SplitPane from "./components/SplitPane";
import MenuBar, { Menu } from "./components/MenuBar";
import PromptDialog, { PromptRequest, PromptState } from "./components/PromptDialog";
import Home from "./components/Home";
import { THEMES, THEME_LIST, ThemeId } from "./themes";
import logoIcon from "./assets/icon.png";
import "./App.css";

const THEME_STORAGE_KEY = "localtex-theme";

function loadStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && stored in THEMES) return stored as ThemeId;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return "vscode-dark";
}

function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : path;
}

function toPdfPath(texPath: string): string {
  return texPath.replace(/\.tex$/, ".pdf");
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

// Non-text files that aren't images or PDFs — LaTeX build artifacts and
// common binary formats a project can contain. These must never be opened
// with readTextFile: decoding them as UTF-8 garbles the bytes, and if the
// (garbled) result were ever saved back it would corrupt the file on disk.
const BINARY_EXTENSIONS = [
  "gz",
  "zip",
  "bin",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "ico",
  "mp3",
  "mp4",
  "class",
  "o",
  "exe",
  "dll",
  "pyc",
];

type ViewMode = "text" | "image" | "pdf" | "unsupported";

function classifyFile(filePath: string): ViewMode {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (BINARY_EXTENSIONS.includes(ext)) return "unsupported";
  return "text";
}

const INSERT_SNIPPETS: { label: string; text: string }[] = [
  { label: "Section", text: "\\section{}" },
  { label: "Subsection", text: "\\subsection{}" },
  { label: "Bulleted List", text: "\\begin{itemize}\n  \\item \n\\end{itemize}" },
  { label: "Numbered List", text: "\\begin{enumerate}\n  \\item \n\\end{enumerate}" },
  {
    label: "Table",
    text:
      "\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{cc}\n    a & b \\\\\n    c & d \\\\\n  \\end{tabular}\n\\end{table}",
  },
  {
    label: "Figure",
    text:
      "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n\\end{figure}",
  },
  { label: "Equation", text: "\\begin{equation}\n  \n\\end{equation}" },
];

export default function App() {
  const [view, setView] = useState<"home" | "editor">("home");
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [texPath, setTexPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [treeRefreshToken, setTreeRefreshToken] = useState(0);
  const [log, setLog] = useState("");
  const [logVisible, setLogVisible] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [terminalDock, setTerminalDock] = useState<"bottom" | "right">("bottom");
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(loadStoredTheme);
  const theme = THEMES[themeId];

  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value);
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // localStorage unavailable — theme just won't persist across restarts.
    }
  }, [themeId, theme]);
  const [viewMode, setViewMode] = useState<ViewMode>("text");
  const [imageData, setImageData] = useState<string | null>(null);

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return { words, chars: content.length };
  }, [content]);

  function promptForName(request: PromptRequest): Promise<string | null> {
    return new Promise((resolve) => {
      setPromptState({
        ...request,
        resolve: (value) => {
          setPromptState(null);
          resolve(value);
        },
      });
    });
  }
  const saveTimer = useRef<number | undefined>(undefined);
  const editorRef = useRef<EditorHandle>(null);
  const pdfRef = useRef<PdfPreviewHandle>(null);
  const openRequestId = useRef(0);

  // Kept in sync every render so the debounced autosave below can check the
  // *current* file/mode at write-time, not the stale values it was scheduled
  // with — a scheduled write must never land on a file that isn't the text
  // file it was meant for (e.g. after switching to viewing a PDF/image).
  const texPathRef = useRef(texPath);
  texPathRef.current = texPath;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  useEffect(() => {
    window.api.ensureProjectsRoot();
  }, []);

  async function openProject(dir: string, projectTexPath: string | null) {
    setProjectDir(dir);
    if (projectTexPath) {
      await openFile(projectTexPath);
    } else {
      setTexPath(null);
      setContent("");
      setPdfPath(null);
      setImageData(null);
      setViewMode("text");
    }
    setView("editor");
  }

  function goHome() {
    flushPendingSave();
    setView("home");
  }

  // Writes out any edit still waiting in the autosave debounce, so switching
  // files (or the app closing) can't silently drop it.
  async function flushPendingSave() {
    if (!saveTimer.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (texPath && viewMode === "text") {
      await window.api.writeTextFile(texPath, content);
      setDirty(false);
    }
  }

  async function openFile(path: string) {
    await flushPendingSave();
    const requestId = ++openRequestId.current;
    const kind = classifyFile(path);

    setTexPath(path);
    setLog("");
    setDirty(false);
    setViewMode(kind);

    if (kind === "image") {
      setContent("");
      const base64 = await window.api.readBinaryFileBase64(path);
      if (openRequestId.current !== requestId) return;
      const ext = path.split(".").pop()?.toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext === "svg" ? "svg+xml" : ext;
      setImageData(`data:image/${mime};base64,${base64}`);
      setPdfPath(null);
      setReloadToken((t) => t + 1);
      return;
    }

    if (kind === "pdf") {
      setContent("");
      setImageData(null);
      setPdfPath(path);
      setReloadToken((t) => t + 1);
      return;
    }

    if (kind === "unsupported") {
      setContent("");
      setImageData(null);
      setPdfPath(null);
      return;
    }

    setImageData(null);
    const text = await window.api.readTextFile(path);
    if (openRequestId.current !== requestId) return; // superseded by a newer open
    setContent(text);

    if (path.endsWith(".tex")) {
      const candidatePdf = toPdfPath(path);
      const exists = await window.api.pathExists(candidatePdf);
      if (openRequestId.current !== requestId) return;
      setPdfPath(exists ? candidatePdf : null);
    } else {
      setPdfPath(null);
    }
    setReloadToken((t) => t + 1);
  }

  async function saveNow() {
    await flushPendingSave();
    if (texPath && viewMode === "text") {
      await window.api.writeTextFile(texPath, content);
      setDirty(false);
    }
  }

  async function handleChange(next: string) {
    setContent(next);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const targetPath = texPath;
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = undefined;
      if (
        targetPath &&
        texPathRef.current === targetPath &&
        viewModeRef.current === "text"
      ) {
        await window.api.writeTextFile(targetPath, next);
        setDirty(false);
      }
    }, 500);
  }

  async function handleOpenFileDialog() {
    const selected = await window.api.openFileDialog();
    if (selected) {
      setProjectDir(dirName(selected));
      await openFile(selected);
    }
  }

  async function handleOpenFromTree(path: string) {
    await openFile(path);
  }

  async function handleExportProject() {
    if (!projectDir) return;
    try {
      await window.api.exportProject(projectDir, projectDir.split("/").pop() ?? "project");
    } catch (e) {
      alert(String(e));
    }
  }

  function handleFileRemoved(path: string) {
    if (texPath && (texPath === path || texPath.startsWith(path + "/"))) {
      // Cancel rather than flush — the file is gone, so a pending autosave
      // must not be allowed to write it back into existence.
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
      }
      setTexPath(null);
      setContent("");
      setPdfPath(null);
      setImageData(null);
      setViewMode("text");
      setDirty(false);
    }
  }

  async function handleSyncToPdf() {
    if (!texPath) return;
    const line = editorRef.current?.getCursorLine();
    if (!line) return;
    const target = await window.api.syncForward(texPath, line);
    if (!target) {
      alert("No sync data for this position — recompile first.");
      return;
    }
    pdfRef.current?.scrollToPosition(target.page, target.x, target.y);
  }

  async function handleSyncFromPdf(page: number, x: number, y: number) {
    if (!texPath) return;
    const target = await window.api.syncReverse(texPath, page, x, y);
    if (!target) return;
    if (target.path !== texPath) {
      await openFile(target.path);
      // Let CodeMirror pick up the new `value` prop before we scroll it.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    editorRef.current?.goToLine(target.line);
  }

  async function handleCompile() {
    if (!texPath || viewMode !== "text") return;
    setCompiling(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await window.api.writeTextFile(texPath, content);
    setDirty(false);
    try {
      const result = await window.api.compileTex(texPath);
      setLog(result.log);
      setLogVisible(!result.success);
      if (result.success && result.pdf_path) {
        setPdfPath(result.pdf_path);
        setReloadToken((t) => t + 1);
        setTreeRefreshToken((t) => t + 1);
      }
    } finally {
      setCompiling(false);
    }
  }

  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "Open…", onSelect: handleOpenFileDialog },
        { label: "Save", onSelect: saveNow, disabled: !texPath || viewMode !== "text" },
        {
          label: "Export Project (.zip)…",
          onSelect: handleExportProject,
          disabled: !projectDir,
        },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", onSelect: () => editorRef.current?.undo() },
        { label: "Redo", onSelect: () => editorRef.current?.redo() },
        { label: "Find / Replace", onSelect: () => editorRef.current?.find() },
      ],
    },
    {
      label: "Insert",
      items: INSERT_SNIPPETS.map((s) => ({
        label: s.label,
        onSelect: () => editorRef.current?.insertAtCursor(s.text),
      })),
    },
    {
      label: "View",
      items: [
        {
          label: sidebarVisible ? "Hide File Sidebar" : "Show File Sidebar",
          onSelect: () => setSidebarVisible((v) => !v),
        },
        {
          label: terminalVisible ? "Hide Terminal" : "Show Terminal",
          onSelect: () => setTerminalVisible((v) => !v),
        },
      ],
    },
    {
      label: "Theme",
      items: THEME_LIST.map((t) => ({
        label: (t.id === themeId ? "✓ " : "") + t.label,
        onSelect: () => setThemeId(t.id),
      })),
    },
  ];

  return (
    <div className="app">
      <div className="toolbar">
        <button className="logo-btn" onClick={goHome} title="Home">
          <img className="logo-icon" src={logoIcon} alt="LocalTeX" width="26" height="26" />
        </button>
        {view === "editor" && (
          <>
            <MenuBar menus={menus} />
            <span className="path">
              {texPath}
              {dirty ? " *" : ""}
            </span>
            {texPath?.endsWith(".tex") && (
              <span className="word-count">
                {wordCount.words} words, {wordCount.chars} characters
              </span>
            )}
            {texPath?.endsWith(".tex") && pdfPath && (
              <button
                className="sync-pdf-btn"
                onClick={handleSyncToPdf}
                title="Jump the PDF preview to the cursor's position"
              >
                ⇅ Sync to PDF
              </button>
            )}
            {log && (
              <button
                className="log-toggle-btn"
                onClick={() => setLogVisible((v) => !v)}
              >
                {logVisible ? "Hide Log" : "Show Log"}
              </button>
            )}
          </>
        )}
      </div>
      {view === "home" ? (
        <Home onOpenProject={openProject} promptForName={promptForName} />
      ) : (
      <div className="main">
        {sidebarVisible && projectDir && (
          <div className="sidebar">
            <FileTree
              rootDir={projectDir}
              activePath={texPath}
              onOpenFile={handleOpenFromTree}
              onFileRemoved={handleFileRemoved}
              refreshToken={treeRefreshToken}
              promptForName={promptForName}
            />
            <OutlinePanel
              content={content}
              onGoToLine={(line) => editorRef.current?.goToLine(line)}
            />
          </div>
        )}
        <div className="editor-preview-area">
          {(() => {
            const viewerContent =
              viewMode === "image" ? (
                <div className="image-viewer">
                  {imageData ? (
                    <img
                      className="image-viewer-img"
                      src={imageData}
                      alt={texPath ?? ""}
                    />
                  ) : (
                    <div className="pdf-empty">Loading…</div>
                  )}
                </div>
              ) : viewMode === "pdf" ? (
                <PdfPreview
                  ref={pdfRef}
                  pdfPath={pdfPath}
                  reloadToken={reloadToken}
                  onCompile={handleCompile}
                  compiling={false}
                  canCompile={false}
                  standalone
                />
              ) : viewMode === "unsupported" ? (
                <div className="pdf-empty">
                  No preview available for this file type.
                </div>
              ) : (
                <SplitPane
                  initialLeftPct={55}
                  left={
                    <div className="editor-pane">
                      <SymbolToolbar
                        onInsert={(text) => editorRef.current?.insertAtCursor(text)}
                      />
                      <Editor ref={editorRef} value={content} onChange={handleChange} theme={theme.editorTheme} />
                    </div>
                  }
                  right={
                    <PdfPreview
                      ref={pdfRef}
                      pdfPath={pdfPath}
                      reloadToken={reloadToken}
                      onCompile={handleCompile}
                      compiling={compiling}
                      canCompile={!!texPath}
                      onSyncClick={handleSyncFromPdf}
                    />
                  }
                />
              );

            if (!projectDir || !terminalVisible) return viewerContent;

            const terminalPanel = (
              <div className="terminal-panel">
                <div className="terminal-header">
                  <span>TERMINAL</span>
                  <div className="terminal-header-actions">
                    <button
                      className="terminal-dock-btn"
                      onClick={() =>
                        setTerminalDock((d) => (d === "bottom" ? "right" : "bottom"))
                      }
                      title={
                        terminalDock === "bottom"
                          ? "Dock to the right"
                          : "Dock to the bottom"
                      }
                    >
                      {terminalDock === "bottom" ? "▤" : "▥"}
                    </button>
                    <button
                      className="terminal-close-btn"
                      onClick={() => setTerminalVisible(false)}
                      title="Close terminal"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="terminal-body">
                  <Terminal cwd={projectDir} theme={theme.terminal} />
                </div>
                {log && logVisible && <pre className="log">{log}</pre>}
              </div>
            );

            if (terminalDock === "right") {
              return (
                <SplitPane
                  initialLeftPct={75}
                  minPct={40}
                  maxPct={90}
                  left={viewerContent}
                  right={terminalPanel}
                />
              );
            }

            if (viewMode === "text") {
              // Bottom dock only splits the editor column, so the PDF
              // preview keeps its full height instead of being squeezed.
              return (
                <SplitPane
                  initialLeftPct={55}
                  left={
                    <SplitPane
                      orientation="vertical"
                      initialLeftPct={70}
                      minPct={30}
                      maxPct={85}
                      left={
                        <div className="editor-pane">
                          <SymbolToolbar
                            onInsert={(text) => editorRef.current?.insertAtCursor(text)}
                          />
                          <Editor ref={editorRef} value={content} onChange={handleChange} theme={theme.editorTheme} />
                        </div>
                      }
                      right={terminalPanel}
                    />
                  }
                  right={
                    <PdfPreview
                      ref={pdfRef}
                      pdfPath={pdfPath}
                      reloadToken={reloadToken}
                      onCompile={handleCompile}
                      compiling={compiling}
                      canCompile={!!texPath}
                      onSyncClick={handleSyncFromPdf}
                    />
                  }
                />
              );
            }

            return (
              <SplitPane
                orientation="vertical"
                initialLeftPct={70}
                minPct={30}
                maxPct={85}
                left={viewerContent}
                right={terminalPanel}
              />
            );
          })()}
        </div>
      </div>
      )}
      <PromptDialog state={promptState} />
    </div>
  );
}
