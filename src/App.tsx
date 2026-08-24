import { useEffect, useRef, useState } from "react";
import Editor, { EditorHandle } from "./components/Editor";
import Terminal from "./components/Terminal";
import PdfPreview, { PdfPreviewHandle } from "./components/PdfPreview";
import FileTree from "./components/FileTree";
import SplitPane from "./components/SplitPane";
import MenuBar, { Menu } from "./components/MenuBar";
import "./App.css";

function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : path;
}

function toPdfPath(texPath: string): string {
  return texPath.replace(/\.tex$/, ".pdf");
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
  const saveTimer = useRef<number | undefined>(undefined);
  const editorRef = useRef<EditorHandle>(null);
  const pdfRef = useRef<PdfPreviewHandle>(null);
  const openRequestId = useRef(0);

  useEffect(() => {
    (async () => {
      const project = await window.api.ensureDefaultProject();
      setProjectDir(project.dir);
      await openFile(project.texPath);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writes out any edit still waiting in the autosave debounce, so switching
  // files (or the app closing) can't silently drop it.
  async function flushPendingSave() {
    if (!saveTimer.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (texPath) {
      await window.api.writeTextFile(texPath, content);
      setDirty(false);
    }
  }

  async function openFile(path: string) {
    await flushPendingSave();
    const requestId = ++openRequestId.current;
    const text = await window.api.readTextFile(path);
    if (openRequestId.current !== requestId) return; // superseded by a newer open

    setTexPath(path);
    setContent(text);
    setLog("");
    setDirty(false);

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
    if (texPath) {
      await window.api.writeTextFile(texPath, content);
      setDirty(false);
    }
  }

  async function handleChange(next: string) {
    setContent(next);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = undefined;
      if (texPath) {
        await window.api.writeTextFile(texPath, next);
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
      setDirty(false);
    }
  }

  async function handleNewFileInRoot() {
    if (!projectDir) return;
    const name = window.prompt("New file name (e.g. chapter1.tex):");
    if (!name) return;
    try {
      await window.api.createFile(`${projectDir}/${name}`);
      setTreeRefreshToken((t) => t + 1);
    } catch (e) {
      alert(String(e));
    }
  }

  async function handleNewFolderInRoot() {
    if (!projectDir) return;
    const name = window.prompt("New folder name:");
    if (!name) return;
    try {
      await window.api.createFolder(`${projectDir}/${name}`);
      setTreeRefreshToken((t) => t + 1);
    } catch (e) {
      alert(String(e));
    }
  }

  async function handleCompile() {
    if (!texPath) return;
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
        { label: "New File", onSelect: handleNewFileInRoot },
        { label: "New Folder", onSelect: handleNewFolderInRoot },
        { label: "Open…", onSelect: handleOpenFileDialog },
        { label: "Save", onSelect: saveNow, disabled: !texPath },
        {
          label: "Compile",
          onSelect: handleCompile,
          disabled: !texPath || compiling,
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
        { label: "Zoom In (PDF)", onSelect: () => pdfRef.current?.zoomIn() },
        { label: "Zoom Out (PDF)", onSelect: () => pdfRef.current?.zoomOut() },
        {
          label: "Reset Zoom (PDF)",
          onSelect: () => pdfRef.current?.resetZoom(),
        },
      ],
    },
  ];

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="toolbar">
        <span className="title">LocalTeX</span>
        <span className="path">
          {texPath}
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
      </div>
      <div className="main">
        {sidebarVisible && projectDir && (
          <FileTree
            rootDir={projectDir}
            activePath={texPath}
            onOpenFile={handleOpenFromTree}
            onFileRemoved={handleFileRemoved}
            refreshToken={treeRefreshToken}
          />
        )}
        <div className="editor-preview-area">
          <SplitPane
            initialLeftPct={55}
            left={
              <Editor ref={editorRef} value={content} onChange={handleChange} />
            }
            right={
              <PdfPreview
                ref={pdfRef}
                pdfPath={pdfPath}
                reloadToken={reloadToken}
                onCompile={handleCompile}
                compiling={compiling}
                canCompile={!!texPath}
              />
            }
          />
        </div>
      </div>
      {projectDir && (
        <div
          className={
            "bottom-pane" +
            (!terminalVisible && !(log && logVisible) ? " collapsed" : "")
          }
        >
          <div
            className="terminal-wrap"
            style={{ display: terminalVisible ? "block" : "none" }}
          >
            <Terminal cwd={projectDir} />
          </div>
          {log && logVisible && <pre className="log">{log}</pre>}
        </div>
      )}
    </div>
  );
}
