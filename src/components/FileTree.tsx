import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../electron-api";
import type { PromptRequest } from "./PromptDialog";

type MenuState = {
  x: number;
  y: number;
  targetPath: string | null;
  targetIsDir: boolean;
  targetName: string | null;
};

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function FileIcon({ name }: { name: string }) {
  const ext = extOf(name);
  if (ext === "tex") {
    return (
      <svg className="tree-icon tree-icon-tex" viewBox="0 0 16 16" width="14" height="14">
        <path
          fill="currentColor"
          d="M2 1.5h8.4L14 5.1V14.5H2z"
          opacity="0.15"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          d="M2.5 1.5h7.6L13.5 5v9H2.5z"
        />
        <text x="8" y="12" textAnchor="middle" fontSize="6" fontWeight="700" fill="currentColor">
          TEX
        </text>
      </svg>
    );
  }
  if (ext === "pdf") {
    return (
      <svg className="tree-icon tree-icon-pdf" viewBox="0 0 16 16" width="14" height="14">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          d="M2.5 1.5h7.6L13.5 5v9H2.5z"
        />
        <text x="8" y="12" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="currentColor">
          PDF
        </text>
      </svg>
    );
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "bmp", "webp"].includes(ext)) {
    return (
      <svg className="tree-icon tree-icon-img" viewBox="0 0 16 16" width="14" height="14">
        <rect x="2" y="2.5" width="12" height="11" rx="1" fill="none" stroke="currentColor" />
        <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
        <path d="M2.5 12.5l3.5-4 2.5 2.8 2-2.3 3 3.5" fill="none" stroke="currentColor" />
      </svg>
    );
  }
  if (ext === "bib") {
    return (
      <svg className="tree-icon tree-icon-bib" viewBox="0 0 16 16" width="14" height="14">
        <path fill="none" stroke="currentColor" strokeWidth="1" d="M2.5 1.5h7.6L13.5 5v9H2.5z" />
        <text x="8" y="12" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="currentColor">
          BIB
        </text>
      </svg>
    );
  }
  return (
    <svg className="tree-icon tree-icon-file" viewBox="0 0 16 16" width="14" height="14">
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M2.5 1.5h7.6L13.5 5v9H2.5z" />
    </svg>
  );
}

function FolderIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className="tree-icon tree-icon-folder" viewBox="0 0 16 16" width="14" height="14">
      {expanded ? (
        <path
          fill="currentColor"
          d="M1.5 3.5h4l1.2 1.4H14a.5.5 0 0 1 .5.5v.6H2.3z"
        />
      ) : null}
      <path
        fill="currentColor"
        d="M1.5 4.9h13a.5.5 0 0 1 .49.6l-1 6.5a.5.5 0 0 1-.49.4H2.5a.5.5 0 0 1-.5-.5z"
      />
    </svg>
  );
}

function AddFileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M3 1.5h6.2L12 4.3V14.5H3z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M7.2 8v4M5.2 10h4" />
    </svg>
  );
}

function AddFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        d="M1.5 3.9h4l1.1 1.3h7.9v8.3h-13z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M8 8v3.4M6.3 9.7h3.4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M8 10.5V2.3M5.2 5.1 8 2.3l2.8 2.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.1" d="M2.5 10.8v2.9h11v-2.9" />
    </svg>
  );
}

// Native HTML5 drag-and-drop (draggable + dragstart/dragover/drop) is
// unreliable under Electron on Wayland — the OS-level drag it depends on
// often never engages. This drives moves from plain mouse events instead:
// mousedown+move past a small threshold starts a drag, mouseenter/leave on
// candidate drop targets track the current target, mouseup commits it.
function TreeNode({
  entry,
  activePath,
  selectedDir,
  draggingPath,
  dragOverPath,
  onOpenFile,
  onSelectDir,
  onContextMenu,
  onRowMouseDown,
  onRowMouseEnter,
  onRowMouseLeave,
  onRename,
  depth,
}: {
  entry: FileEntry;
  activePath: string | null;
  selectedDir: string;
  draggingPath: string | null;
  dragOverPath: string | null;
  onOpenFile: (path: string) => void;
  onSelectDir: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  onRowMouseDown: (e: React.MouseEvent, path: string) => void;
  onRowMouseEnter: (path: string) => void;
  onRowMouseLeave: (path: string) => void;
  onRename: (entry: FileEntry) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDragging = draggingPath === entry.path;
  const isDragOver = dragOverPath === entry.path && draggingPath !== entry.path;

  if (entry.is_dir) {
    return (
      <div>
        <div
          className={
            "tree-row tree-dir" +
            (entry.path === selectedDir ? " selected" : "") +
            (isDragOver ? " drag-over" : "") +
            (isDragging ? " dragging" : "")
          }
          style={{ paddingLeft: 8 + depth * 14 }}
          onMouseDown={(e) => onRowMouseDown(e, entry.path)}
          onMouseEnter={() => onRowMouseEnter(entry.path)}
          onMouseLeave={() => onRowMouseLeave(entry.path)}
          onClick={() => {
            setExpanded((e) => !e);
            onSelectDir(entry.path);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRename(entry);
          }}
          onContextMenu={(e) => onContextMenu(e, entry)}
        >
          <span className="tree-caret">{expanded ? "▾" : "▸"}</span>
          <FolderIcon expanded={expanded} />
          <span className="tree-name">{entry.name}</span>
        </div>
        {expanded &&
          entry.children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              activePath={activePath}
              selectedDir={selectedDir}
              draggingPath={draggingPath}
              dragOverPath={dragOverPath}
              onOpenFile={onOpenFile}
              onSelectDir={onSelectDir}
              onContextMenu={onContextMenu}
              onRowMouseDown={onRowMouseDown}
              onRowMouseEnter={onRowMouseEnter}
              onRowMouseLeave={onRowMouseLeave}
              onRename={onRename}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={
        "tree-row tree-file" +
        (entry.path === activePath ? " active" : "") +
        (isDragging ? " dragging" : "")
      }
      style={{ paddingLeft: 8 + depth * 14 }}
      onMouseDown={(e) => onRowMouseDown(e, entry.path)}
      onClick={() => onOpenFile(entry.path)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRename(entry);
      }}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <FileIcon name={entry.name} />
      <span className="tree-name">{entry.name}</span>
    </div>
  );
}

export default function FileTree({
  rootDir,
  activePath,
  onOpenFile,
  onFileRemoved,
  refreshToken,
  promptForName,
}: {
  rootDir: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onFileRemoved: (path: string) => void;
  refreshToken: number;
  promptForName: (request: PromptRequest) => Promise<string | null>;
}) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState(rootDir);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [projectExpanded, setProjectExpanded] = useState(true);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    path: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const dragOverPathRef = useRef<string | null>(null);

  const projectName = rootDir.split("/").filter(Boolean).pop() ?? rootDir;

  async function refresh() {
    try {
      const result = await window.api.listProjectTree(rootDir);
      setTree(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    setSelectedDir(rootDir);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootDir, refreshToken]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  function openMenuAt(x: number, y: number, entry?: FileEntry) {
    setMenu({
      x,
      y,
      targetPath: entry?.path ?? null,
      targetIsDir: entry?.is_dir ?? false,
      targetName: entry?.name ?? null,
    });
  }

  function handleEmptyAreaClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    setSelectedDir(rootDir);
    openMenuAt(e.clientX, e.clientY);
  }

  function handleRowContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault();
    if (entry.is_dir) setSelectedDir(entry.path);
    openMenuAt(e.clientX, e.clientY, entry);
  }

  async function createFileIn(dir: string) {
    const name = await promptForName({ title: "New file name (e.g. chapter1.tex):" });
    if (!name) return;
    try {
      await window.api.createFile(`${dir}/${name}`);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function createFolderIn(dir: string) {
    const name = await promptForName({ title: "New folder name:" });
    if (!name) return;
    try {
      await window.api.createFolder(`${dir}/${name}`);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function uploadInto(dir: string) {
    try {
      await window.api.uploadFile(dir);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function renameTarget(path: string, currentName: string) {
    const name = await promptForName({
      title: "Rename to:",
      defaultValue: currentName,
      confirmLabel: "Rename",
    });
    if (!name || name === currentName) return;
    const parent = path.slice(0, path.length - currentName.length - 1);
    try {
      await window.api.renamePath(path, `${parent}/${name}`);
      onFileRemoved(path);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function deleteTarget(path: string, isDir: boolean) {
    const label = isDir ? "folder and everything inside it" : "file";
    if (!window.confirm(`Delete this ${label}?`)) return;
    try {
      await window.api.deletePath(path);
      onFileRemoved(path);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function moveEntry(sourcePath: string, targetDir: string) {
    if (sourcePath === targetDir) return;
    if (targetDir === sourcePath || targetDir.startsWith(sourcePath + "/")) return;
    const name = sourcePath.split("/").pop()!;
    const dest = `${targetDir}/${name}`;
    if (dest === sourcePath) return;
    try {
      await window.api.renamePath(sourcePath, dest);
      if (activePath && (activePath === sourcePath || activePath.startsWith(sourcePath + "/"))) {
        onFileRemoved(sourcePath);
      }
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  function handleRowMouseDown(e: React.MouseEvent, path: string) {
    if (e.button !== 0) return;
    dragStateRef.current = {
      path,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };

    const onMouseMove = (ev: MouseEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      if (!s.dragging) {
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        if (Math.hypot(dx, dy) > 4) {
          s.dragging = true;
          setDraggingPath(s.path);
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const s = dragStateRef.current;
      const target = dragOverPathRef.current;
      dragStateRef.current = null;
      setDraggingPath(null);
      setDragOverPath(null);
      dragOverPathRef.current = null;

      if (s?.dragging && target && target !== s.path) {
        moveEntry(s.path, target);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleRowMouseEnter(path: string) {
    if (!dragStateRef.current?.dragging) return;
    dragOverPathRef.current = path;
    setDragOverPath(path);
  }

  function handleRowMouseLeave(path: string) {
    if (dragOverPathRef.current === path) {
      dragOverPathRef.current = null;
      setDragOverPath(null);
    }
  }

  function handleBodyMouseEnter() {
    if (!dragStateRef.current?.dragging) return;
    dragOverPathRef.current = rootDir;
    setDragOverPath(rootDir);
  }

  function handleBodyMouseLeave() {
    if (dragOverPathRef.current === rootDir) {
      dragOverPathRef.current = null;
      setDragOverPath(null);
    }
  }

  return (
    <div className="file-tree">
      <div
        className="file-tree-project"
        onClick={() => setProjectExpanded((v) => !v)}
      >
        <span className="tree-caret">{projectExpanded ? "▾" : "▸"}</span>
        <span className="file-tree-project-name">{projectName}</span>
      </div>
      <div className="file-tree-toolbar">
        <button
          className="tree-icon-btn"
          onClick={() => createFileIn(selectedDir)}
          title="New file"
        >
          <AddFileIcon />
        </button>
        <button
          className="tree-icon-btn"
          onClick={() => createFolderIn(selectedDir)}
          title="New folder"
        >
          <AddFolderIcon />
        </button>
        <button
          className="tree-icon-btn"
          onClick={() => uploadInto(selectedDir)}
          title="Upload file"
        >
          <UploadIcon />
        </button>
      </div>
      {projectExpanded && (
        <div
          className={"file-tree-body" + (dragOverPath === rootDir ? " drag-over" : "")}
          onClick={handleEmptyAreaClick}
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              setSelectedDir(rootDir);
              openMenuAt(e.clientX, e.clientY);
            }
          }}
          onMouseEnter={handleBodyMouseEnter}
          onMouseLeave={handleBodyMouseLeave}
        >
          {error && <div className="tree-error">{error}</div>}
          {tree.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              activePath={activePath}
              selectedDir={selectedDir}
              draggingPath={draggingPath}
              dragOverPath={dragOverPath}
              onOpenFile={onOpenFile}
              onSelectDir={setSelectedDir}
              onContextMenu={handleRowContextMenu}
              onRowMouseDown={handleRowMouseDown}
              onRowMouseEnter={handleRowMouseEnter}
              onRowMouseLeave={handleRowMouseLeave}
              onRename={(e) => renameTarget(e.path, e.name)}
              depth={0}
            />
          ))}
        </div>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => {
              createFileIn(menu.targetIsDir ? menu.targetPath! : rootDir);
              setMenu(null);
            }}
          >
            New File
          </button>
          <button
            onClick={() => {
              createFolderIn(menu.targetIsDir ? menu.targetPath! : rootDir);
              setMenu(null);
            }}
          >
            New Folder
          </button>
          <button
            onClick={() => {
              uploadInto(menu.targetIsDir ? menu.targetPath! : rootDir);
              setMenu(null);
            }}
          >
            Upload File
          </button>
          {menu.targetPath && (
            <>
              <div className="context-menu-sep" />
              <button
                onClick={() => {
                  renameTarget(menu.targetPath!, menu.targetName!);
                  setMenu(null);
                }}
              >
                Rename
              </button>
              <button
                className="context-menu-danger"
                onClick={() => {
                  deleteTarget(menu.targetPath!, menu.targetIsDir);
                  setMenu(null);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
