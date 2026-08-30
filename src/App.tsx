import { useEffect, useRef, useState } from "react";
import Editor, { EditorHandle } from "./components/Editor";
import Terminal from "./components/Terminal";
import PdfPreview, { PdfPreviewHandle } from "./components/PdfPreview";
import FileTree from "./components/FileTree";
import OutlinePanel from "./components/OutlinePanel";
import SearchPanel from "./components/SearchPanel";
import GitPanel from "./components/GitPanel";
import DiffView from "./components/DiffView";
import SymbolToolbar from "./components/SymbolToolbar";
import SplitPane from "./components/SplitPane";
import MenuBar, { Menu } from "./components/MenuBar";
import PromptDialog, { PromptRequest, PromptState } from "./components/PromptDialog";
import Home from "./components/Home";
import { THEMES, THEME_LIST, ThemeId } from "./themes";
import logoIcon from "./assets/icon.png";
import "./App.css";

const THEME_STORAGE_KEY = "localtex-theme";
const FONT_SIZE_STORAGE_KEY = "localtex-font-size";
const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];
const DEFAULT_FONT_SIZE = 14;

// Common coding fonts. These aren't bundled — the CSP only allows local
// assets — so each just names a family and falls back to the generic
// monospace stack when it isn't installed on the host system.
const FONT_FAMILY_STORAGE_KEY = "localtex-font-family";
const FONT_FAMILIES = [
  { id: "default", label: "Default", stack: '"Noto Sans Bengali", monospace' },
  { id: "menlo", label: "Menlo", stack: 'Menlo, "Noto Sans Bengali", monospace' },
  { id: "consolas", label: "Consolas", stack: 'Consolas, "Noto Sans Bengali", monospace' },
  { id: "fira-code", label: "Fira Code", stack: '"Fira Code", "Noto Sans Bengali", monospace' },
  { id: "jetbrains-mono", label: "JetBrains Mono", stack: '"JetBrains Mono", "Noto Sans Bengali", monospace' },
  { id: "source-code-pro", label: "Source Code Pro", stack: '"Source Code Pro", "Noto Sans Bengali", monospace' },
  { id: "cascadia-code", label: "Cascadia Code", stack: '"Cascadia Code", "Noto Sans Bengali", monospace' },
  { id: "ubuntu-mono", label: "Ubuntu Mono", stack: '"Ubuntu Mono", "Noto Sans Bengali", monospace' },
] as const;
const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].id;

function loadStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && stored in THEMES) return stored as ThemeId;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return "vscode-dark";
}

function loadStoredFontSize(): number {
  try {
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (FONT_SIZES.includes(parsed)) return parsed;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return DEFAULT_FONT_SIZE;
}

function loadStoredFontFamily(): string {
  try {
    const stored = window.localStorage.getItem(FONT_FAMILY_STORAGE_KEY);
    if (stored && FONT_FAMILIES.some((f) => f.id === stored)) return stored;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return DEFAULT_FONT_FAMILY;
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
  const [sidebarMode, setSidebarMode] = useState<"files" | "search" | "git">("files");
  const [gitRefreshToken, setGitRefreshToken] = useState(0);
  const [gitBaseline, setGitBaseline] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<{
    path: string;
    diff: string;
    staged: boolean;
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [pdfPaneVisible, setPdfPaneVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [terminalDock, setTerminalDock] = useState<"bottom" | "right">("bottom");
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(loadStoredTheme);
  const theme = THEMES[themeId];
  const [fontSize, setFontSize] = useState<number>(loadStoredFontSize);
  const [fontFamilyId, setFontFamilyId] = useState<string>(loadStoredFontFamily);

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

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
    } catch {
      // localStorage unavailable — font size just won't persist across restarts.
    }
  }, [fontSize]);

  useEffect(() => {
    const stack = FONT_FAMILIES.find((f) => f.id === fontFamilyId)?.stack ?? FONT_FAMILIES[0].stack;
    document.documentElement.style.setProperty("--editor-font-family", stack);
    try {
      window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, fontFamilyId);
    } catch {
      // localStorage unavailable — font family just won't persist across restarts.
    }
  }, [fontFamilyId]);
  const [viewMode, setViewMode] = useState<ViewMode>("text");
  const [imageData, setImageData] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

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
  // Bumped whenever the buffer stops representing what a queued/in-flight save
  // should write — a git operation, a reload, a file swap. A save compares the
  // generation it captured against this before touching disk, so a write that
  // was already scheduled can never land on top of newer content.
  const saveGeneration = useRef(0);
  // The write currently awaiting `writeTextFile`, if any. A git operation waits
  // on this before running, so no save can complete mid-operation.
  const saveInFlight = useRef<Promise<void> | null>(null);
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

  /**
   * Cancel any queued autosave and invalidate any that is already scheduled or
   * in flight, so it cannot write stale content after this point.
   */
  function invalidatePendingSave() {
    saveGeneration.current++;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
  }

  /**
   * Called before a git operation that rewrites the worktree. Cancelling the
   * queued save is not enough on its own: one may already be awaiting
   * `writeTextFile`, and if it lands *after* git has rewritten the file we'd
   * silently undo the operation. So we also wait for it to settle first.
   */
  async function suspendSavesForGitOp() {
    invalidatePendingSave();
    try {
      await saveInFlight.current;
    } catch {
      // A failed write is reported by its own caller; we only need it settled.
    }
  }

  /**
   * Re-read the open file from disk. Git operations (checkout, discard, stash)
   * rewrite files underneath the editor, so its buffer would otherwise be
   * stale — and the next autosave would write the stale copy straight back.
   */
  async function reloadOpenFile() {
    const target = texPathRef.current;
    if (!target || viewModeRef.current !== "text") return;
    invalidatePendingSave();
    // Take a ticket the same way openFile does: a slow read must not transplant
    // this file's contents into whatever the user opened in the meantime.
    const requestId = ++openRequestId.current;
    try {
      const fresh = await window.api.readTextFile(target);
      if (openRequestId.current !== requestId) return;
      setContent(fresh);
      setDirty(false);
    } catch {
      if (openRequestId.current !== requestId) return;
      // The operation removed the file (branch switch, discard of an untracked
      // file). Tear the editor down rather than leaving a stale-but-editable
      // buffer that the next keystroke would write back into existence.
      handleFileRemoved(target);
    }
  }

  // Baseline for the editor's change gutter: the open file's contents at HEAD.
  // Refetched when the file changes and after any git operation, since both
  // move what "unchanged" means.
  useEffect(() => {
    let cancelled = false;
    if (!projectDir || !texPath || viewMode !== "text") {
      setGitBaseline(null);
      return;
    }
    const relPath = texPath.startsWith(projectDir + "/")
      ? texPath.slice(projectDir.length + 1)
      : null;
    if (!relPath) {
      setGitBaseline(null);
      return;
    }
    window.api
      .gitHeadFile(projectDir, relPath)
      .then((head) => {
        if (!cancelled) setGitBaseline(head);
      })
      .catch(() => {
        if (!cancelled) setGitBaseline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectDir, texPath, viewMode, gitRefreshToken]);

  // Writes out any edit still waiting in the autosave debounce, so switching
  // files (or the app closing) can't silently drop it.
  async function flushPendingSave() {
    if (!saveTimer.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    saveGeneration.current++;
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
      setGitRefreshToken((t) => t + 1);
    }
  }

  async function handleChange(next: string) {
    setContent(next);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const targetPath = texPath;
    const generation = saveGeneration.current;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      if (
        !targetPath ||
        texPathRef.current !== targetPath ||
        viewModeRef.current !== "text" ||
        // A git operation, reload, or file swap happened after this save was
        // queued; `next` is stale and must not be written.
        saveGeneration.current !== generation
      ) {
        return;
      }
      const write = window.api
        .writeTextFile(targetPath, next)
        .then(() => {
          if (saveGeneration.current === generation) setDirty(false);
        })
        .finally(() => {
          if (saveInFlight.current === write) saveInFlight.current = null;
        });
      saveInFlight.current = write;
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
      invalidatePendingSave();
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
    // Reset the handle as well as clearing it; a stale truthy handle makes
    // flushPendingSave believe a write is forever pending.
    invalidatePendingSave();
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
        { label: "All Projects", onSelect: goHome },
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
        { label: "Toggle Comment", onSelect: () => editorRef.current?.toggleComment() },
        { label: "Find / Replace", onSelect: () => editorRef.current?.find() },
        {
          label: "Find in Files",
          onSelect: () => {
            setSidebarMode("search");
            setSidebarVisible(true);
          },
        },
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
          onSelect: () => {
            if (sidebarVisible) {
              setSidebarVisible(false);
            } else {
              setSidebarMode("files");
              setSidebarVisible(true);
            }
          },
        },
      ],
    },
  ];

  return (
    <div className="app">
      <div className="app-body">
      <div className="toolbar">
        {view === "editor" && (
          <>
            <button className="toolbar-logo" onClick={goHome} title="Back to All Projects">
              <img src={logoIcon} alt="" width="18" height="18" />
              <span className="toolbar-logo-label">All Projects</span>
            </button>
            <MenuBar menus={menus} />
            <div className="menu-dropdown">
              <button
                className={
                  "menu-trigger" +
                  (sidebarVisible && sidebarMode === "git" ? " open" : "")
                }
                onClick={() => {
                  if (sidebarVisible && sidebarMode === "git") {
                    setSidebarVisible(false);
                  } else {
                    setSidebarMode("git");
                    setSidebarVisible(true);
                    // Status goes stale while the panel is hidden; re-read on open.
                    setGitRefreshToken((t) => t + 1);
                  }
                }}
              >
                Git
              </button>
            </div>
            <div className="menu-dropdown">
              <button
                className={"menu-trigger" + (terminalVisible ? " open" : "")}
                onClick={() => setTerminalVisible((v) => !v)}
              >
                Terminal
              </button>
            </div>
            <div className="menu-dropdown">
              <button
                className={"menu-trigger" + (settingsModalOpen ? " open" : "")}
                onClick={() => setSettingsModalOpen(true)}
              >
                Settings
              </button>
            </div>
            <span className="filename">
              {texPath?.split("/").pop()}
              {dirty ? " *" : ""}
            </span>
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
              ) : sidebarMode === "git" ? (
                <GitPanel
                  rootDir={projectDir}
                  refreshToken={gitRefreshToken}
                  onOpenDiff={(path, diff, staged) =>
                    setDiffTarget({ path, diff, staged })
                  }
                  onWorktreeWillChange={suspendSavesForGitOp}
                  onRepoChanged={(worktree) => {
                    // Only re-read the buffer when files on disk may have moved
                    // under it. Doing it for index-only operations (stage,
                    // commit, refresh) would throw away unsaved typing.
                    if (worktree) reloadOpenFile();
                    // A committed change moves HEAD, so the gutter baseline is
                    // stale either way.
                    setTreeRefreshToken((t) => t + 1);
                    setGitRefreshToken((t) => t + 1);
                    // The open diff is a snapshot; after any operation it may
                    // no longer describe anything real.
                    setDiffTarget(null);
                  }}
                  promptForName={promptForName}
                />
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
            // A diff takes over the pane the way VS Code's diff editor does,
            // and returning early keeps the editor/PDF panes mounted behind it.
            const viewerContent = diffTarget ? (
              <DiffView
                filePath={diffTarget.path}
                diff={diffTarget.diff}
                staged={diffTarget.staged}
                onClose={() => setDiffTarget(null)}
              />
            ) : viewMode === "image" ? (
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
                      <Editor
                        ref={editorRef}
                        value={content}
                        onChange={handleChange}
                        theme={theme.editorTheme}
                        baseline={gitBaseline}
                      />
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
                            log={log}
                            logVisible={logVisible}
                            onToggleLog={() => setLogVisible((v) => !v)}
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

            // A diff replaces the editor, so it takes the generic
            // viewerContent path below rather than this editor-specific one.
            if (viewMode === "text" && !diffTarget) {
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
                      <Editor
                        ref={editorRef}
                        value={content}
                        onChange={handleChange}
                        theme={theme.editorTheme}
                        baseline={gitBaseline}
                      />
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
                        log={log}
                        logVisible={logVisible}
                        onToggleLog={() => setLogVisible((v) => !v)}
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
      {settingsModalOpen && (
        <div className="modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="modal-dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <div className="settings-dialog-heading">
                <span className="settings-dialog-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="17" height="17" fill="none"
                       stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="2.1" />
                    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8
                              M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1
                              M12.2 12.2l-1.1-1.1M4.9 4.9 3.8 3.8" />
                  </svg>
                </span>
                <span className="modal-title">Settings</span>
              </div>
              <button
                className="settings-dialog-close"
                onClick={() => setSettingsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Theme</div>
              <div className="settings-swatch-row">
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    className={"settings-swatch" + (t.id === themeId ? " active" : "")}
                    onClick={() => setThemeId(t.id)}
                    title={t.label}
                  >
                    <span
                      className="settings-swatch-preview"
                      style={{ background: t.vars["--bg-app"] }}
                    >
                      <span
                        className="settings-swatch-dot"
                        style={{ background: t.vars["--accent"] }}
                      />
                      <span
                        className="settings-swatch-line"
                        style={{ background: t.vars["--text-secondary"] }}
                      />
                      {t.id === themeId && <span className="settings-swatch-check">✓</span>}
                    </span>
                    <span className="settings-swatch-label">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Font Family</div>
              <div className="settings-font-list">
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    className={"settings-font-option" + (f.id === fontFamilyId ? " active" : "")}
                    onClick={() => setFontFamilyId(f.id)}
                    style={{ fontFamily: f.stack }}
                  >
                    <span className="settings-font-option-label">{f.label}</span>
                    <span className="settings-font-option-sample">Aa 12</span>
                    {f.id === fontFamilyId && <span className="settings-font-option-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label-row">
                <span className="settings-section-label">Font Size</span>
                <span className="settings-font-value">{fontSize}px</span>
              </div>
              <div className="settings-font-slider-row">
                <button
                  className="settings-stepper-btn"
                  onClick={() => setFontSize(FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(fontSize) - 1)])}
                  disabled={fontSize === FONT_SIZES[0]}
                  aria-label="Decrease font size"
                >
                  −
                </button>
                <input
                  className="settings-font-slider"
                  type="range"
                  min={FONT_SIZES[0]}
                  max={FONT_SIZES[FONT_SIZES.length - 1]}
                  step={1}
                  list="settings-font-ticks"
                  value={fontSize}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const nearest = FONT_SIZES.reduce((a, b) =>
                      Math.abs(b - raw) < Math.abs(a - raw) ? b : a,
                    );
                    setFontSize(nearest);
                  }}
                />
                <datalist id="settings-font-ticks">
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size} />
                  ))}
                </datalist>
                <button
                  className="settings-stepper-btn"
                  onClick={() =>
                    setFontSize(
                      FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(fontSize) + 1)],
                    )
                  }
                  disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                  aria-label="Increase font size"
                >
                  +
                </button>
              </div>
              <div
                className="settings-font-preview"
                style={{
                  fontSize,
                  fontFamily: FONT_FAMILIES.find((f) => f.id === fontFamilyId)?.stack,
                }}
              >
                \section{"{"}The quick brown fox{"}"}
              </div>
            </div>

            <div className="modal-actions">
              <button className="modal-btn modal-btn-primary" onClick={() => setSettingsModalOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
