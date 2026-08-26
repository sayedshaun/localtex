import { useEffect, useRef, useState } from "react";
import Editor, { EditorHandle } from "./components/Editor";
import Terminal from "./components/Terminal";
import PdfPreview, { PdfPreviewHandle } from "./components/PdfPreview";
import FileTree from "./components/FileTree";
import OutlinePanel from "./components/OutlinePanel";
import SearchPanel from "./components/SearchPanel";
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

function FilesRailIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.4l1.6 1.8h6A1.5 1.5 0 0 1 17 7.3v7.2A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z"
      />
    </svg>
  );
}

function SearchRailIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19">
      <circle cx="8.6" cy="8.6" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" d="M12.6 12.6 17 17" />
    </svg>
  );
}

function GitRailIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19">
      <circle cx="6" cy="5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="15" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14" cy="10" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M6 6.8v6.4M7.6 5.8 12.4 9" />
    </svg>
  );
}

function GearRailIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19">
      <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        d="M10 3.2v1.9M10 14.9v1.9M16.8 10h-1.9M5.1 10H3.2M14.8 5.2l-1.3 1.3M6.5 13.5l-1.3 1.3M14.8 14.8l-1.3-1.3M6.5 6.5 5.2 5.2"
      />
    </svg>
  );
}

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
  const [sidebarMode, setSidebarMode] = useState<"files" | "search">("files");
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [pdfPaneVisible, setPdfPaneVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [terminalDock, setTerminalDock] = useState<"bottom" | "right">("bottom");
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(loadStoredTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  async function handleOpenSearchMatch(path: string, line: number) {
    if (path !== texPath) {
      await openFile(path);
      // Let CodeMirror pick up the new `value` prop before we scroll it.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    editorRef.current?.goToLine(line);
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
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    editorRef.current?.goToLine(target.line);
  }

  function startSidebarResize(e: React.MouseEvent) {
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.min(Math.max(startWidth + (ev.clientX - startX), 160), 480);
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
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
      <div className="activity-bar">
        <button className="activity-bar-logo" onClick={goHome} title="Home">
          <img className="logo-icon" src={logoIcon} alt="LocalTeX" width="24" height="24" />
        </button>
        {view === "editor" && (
          <div className="activity-bar-icons">
            <button
              className={
                "activity-bar-btn" +
                (sidebarVisible && sidebarMode === "files" ? " active" : "")
              }
              onClick={() => {
                if (sidebarVisible && sidebarMode === "files") {
                  setSidebarVisible(false);
                } else {
                  setSidebarMode("files");
                  setSidebarVisible(true);
                }
              }}
              title="Files"
            >
              <FilesRailIcon />
            </button>
            <button
              className={
                "activity-bar-btn" +
                (sidebarVisible && sidebarMode === "search" ? " active" : "")
              }
              onClick={() => {
                if (sidebarVisible && sidebarMode === "search") {
                  setSidebarVisible(false);
                } else {
                  setSidebarMode("search");
                  setSidebarVisible(true);
                }
              }}
              title="Search"
            >
              <SearchRailIcon />
            </button>
            <button
              className={"activity-bar-btn" + (terminalVisible ? " active" : "")}
              onClick={() => setTerminalVisible((v) => !v)}
              title="Source control (terminal)"
            >
              <GitRailIcon />
            </button>
          </div>
        )}
        <button
          className="activity-bar-btn activity-bar-btn-bottom"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <GearRailIcon />
        </button>
      </div>
      <div className="app-body">
      <div className="toolbar">
        {view === "editor" && (
          <>
            <MenuBar menus={menus} />
            <span className="filename">
              {texPath?.split("/").pop()}
              {dirty ? " *" : ""}
            </span>
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
        {projectDir && sidebarVisible && (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              {sidebarMode === "files" ? (
                <>
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
                </>
              ) : (
                <SearchPanel rootDir={projectDir} onOpenMatch={handleOpenSearchMatch} />
              )}
              <button
                className="sidebar-fold-btn"
                onClick={() => setSidebarVisible(false)}
                title="Collapse sidebar"
              >
                ‹
              </button>
            </div>
            <div
              className="sidebar-resize-handle"
              onMouseDown={startSidebarResize}
            />
          </>
        )}
        {projectDir && !sidebarVisible && (
          <button
            className="sidebar-unfold-btn"
            onClick={() => setSidebarVisible(true)}
            title="Expand sidebar"
          >
            ›
          </button>
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
                (() => {
                  const editorPaneEl = (
                    <div className="editor-pane">
                      <SymbolToolbar
                        onInsert={(text) => editorRef.current?.insertAtCursor(text)}
                      />
                      <Editor ref={editorRef} value={content} onChange={handleChange} theme={theme.editorTheme} />
                    </div>
                  );

                  if (!pdfPaneVisible) {
                    return (
                      <div className="editor-with-pdf-unfold">
                        {editorPaneEl}
                        <button
                          className="pdf-unfold-btn"
                          onClick={() => setPdfPaneVisible(true)}
                          title="Show PDF preview"
                        >
                          ‹
                        </button>
                      </div>
                    );
                  }

                  return (
                    <SplitPane
                      initialLeftPct={55}
                      left={editorPaneEl}
                      right={
                        <div className="pdf-pane-wrap">
                          <PdfPreview
                            ref={pdfRef}
                            pdfPath={pdfPath}
                            reloadToken={reloadToken}
                            onCompile={handleCompile}
                            compiling={compiling}
                            canCompile={!!texPath}
                            onSyncClick={handleSyncFromPdf}
                            onSyncToPdf={handleSyncToPdf}
                          />
                          <button
                            className="pdf-fold-btn"
                            onClick={() => setPdfPaneVisible(false)}
                            title="Hide PDF preview"
                          >
                            ›
                          </button>
                        </div>
                      }
                    />
                  );
                })()
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
              const editorWithTerminal = (
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
              );

              if (!pdfPaneVisible) {
                return (
                  <div className="editor-with-pdf-unfold">
                    {editorWithTerminal}
                    <button
                      className="pdf-unfold-btn"
                      onClick={() => setPdfPaneVisible(true)}
                      title="Show PDF preview"
                    >
                      ‹
                    </button>
                  </div>
                );
              }

              return (
                <SplitPane
                  initialLeftPct={55}
                  left={editorWithTerminal}
                  right={
                    <div className="pdf-pane-wrap">
                      <PdfPreview
                        ref={pdfRef}
                        pdfPath={pdfPath}
                        reloadToken={reloadToken}
                        onCompile={handleCompile}
                        compiling={compiling}
                        canCompile={!!texPath}
                        onSyncClick={handleSyncFromPdf}
                        onSyncToPdf={handleSyncToPdf}
                      />
                      <button
                        className="pdf-fold-btn"
                        onClick={() => setPdfPaneVisible(false)}
                        title="Hide PDF preview"
                      >
                        ›
                      </button>
                    </div>
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
      </div>
      <PromptDialog state={promptState} />
      {settingsOpen && (
        <div className="modal-overlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal-dialog settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-title">Settings</div>
            <div className="settings-section-label">Theme</div>
            <div className="settings-theme-list">
              {THEME_LIST.map((t) => (
                <button
                  key={t.id}
                  className={"settings-theme-btn" + (t.id === themeId ? " active" : "")}
                  onClick={() => setThemeId(t.id)}
                >
                  {t.id === themeId ? "✓ " : ""}
                  {t.label}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-primary" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
