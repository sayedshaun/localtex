import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Editor, { EditorHandle } from "./components/Editor";
import Terminal from "./components/Terminal";
import PdfPreview, { PdfPreviewHandle } from "./components/PdfPreview";
import FileTree from "./components/FileTree";
import SplitPane from "./components/SplitPane";
import MenuBar, { Menu } from "./components/MenuBar";
import "./App.css";

type CompileResult = {
  success: boolean;
  log: string;
  pdf_path: string | null;
};

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

  useEffect(() => {
    (async () => {
      const project = await invoke<{ dir: string; tex_path: string }>(
        "ensure_default_project",
      );
      setProjectDir(project.dir);
      await openFile(project.tex_path);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openFile(path: string) {
    const text = await invoke<string>("read_text_file", { path });
    setTexPath(path);
    setContent(text);
    setLog("");
    setDirty(false);

    if (path.endsWith(".tex")) {
      const candidatePdf = toPdfPath(path);
      const exists = await invoke<boolean>("path_exists", {
        path: candidatePdf,
      });
      setPdfPath(exists ? candidatePdf : null);
    } else {
      setPdfPath(null);
    }
    setReloadToken((t) => t + 1);
  }

  async function saveNow() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (texPath) {
      await invoke("write_text_file", { path: texPath, contents: content });
      setDirty(false);
    }
  }

  async function handleChange(next: string) {
    setContent(next);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (texPath) {
        await invoke("write_text_file", { path: texPath, contents: next });
        setDirty(false);
      }
    }, 500);
  }

  async function handleOpenFileDialog() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
    });
    if (typeof selected === "string") {
      setProjectDir(dirName(selected));
      await openFile(selected);
    }
  }

  async function handleOpenFromTree(path: string) {
    await openFile(path);
  }

  function handleFileRemoved(path: string) {
    if (texPath && (texPath === path || texPath.startsWith(path + "/"))) {
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
      await invoke("create_file", { path: `${projectDir}/${name}` });
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
      await invoke("create_folder", { path: `${projectDir}/${name}` });
      setTreeRefreshToken((t) => t + 1);
    } catch (e) {
      alert(String(e));
    }
  }

  async function handleCompile() {
    if (!texPath) return;
    setCompiling(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await invoke("write_text_file", { path: texPath, contents: content });
    setDirty(false);
    try {
      const result = await invoke<CompileResult>("compile_tex", {
        path: texPath,
      });
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
