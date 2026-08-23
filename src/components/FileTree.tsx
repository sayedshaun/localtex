import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type FileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
};

type MenuState = {
  x: number;
  y: number;
  targetPath: string | null;
  targetIsDir: boolean;
  targetName: string | null;
};

function TreeNode({
  entry,
  activePath,
  selectedDir,
  onOpenFile,
  onSelectDir,
  onContextMenu,
  depth,
}: {
  entry: FileEntry;
  activePath: string | null;
  selectedDir: string;
  onOpenFile: (path: string) => void;
  onSelectDir: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);

  if (entry.is_dir) {
    return (
      <div>
        <div
          className={
            "tree-row tree-dir" + (entry.path === selectedDir ? " selected" : "")
          }
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            setExpanded((e) => !e);
            onSelectDir(entry.path);
          }}
          onContextMenu={(e) => onContextMenu(e, entry)}
        >
          <span className="tree-caret">{expanded ? "▾" : "▸"}</span>
          <span className="tree-name">{entry.name}</span>
        </div>
        {expanded &&
          entry.children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              activePath={activePath}
              selectedDir={selectedDir}
              onOpenFile={onOpenFile}
              onSelectDir={onSelectDir}
              onContextMenu={onContextMenu}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={
        "tree-row tree-file" + (entry.path === activePath ? " active" : "")
      }
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => onOpenFile(entry.path)}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
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
}: {
  rootDir: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onFileRemoved: (path: string) => void;
  refreshToken: number;
}) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState(rootDir);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const result = await invoke<FileEntry[]>("list_project_tree", {
        root: rootDir,
      });
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
    const name = window.prompt("New file name (e.g. chapter1.tex):");
    if (!name) return;
    try {
      await invoke("create_file", { path: `${dir}/${name}` });
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function createFolderIn(dir: string) {
    const name = window.prompt("New folder name:");
    if (!name) return;
    try {
      await invoke("create_folder", { path: `${dir}/${name}` });
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async function renameTarget(path: string, currentName: string) {
    const name = window.prompt("Rename to:", currentName);
    if (!name || name === currentName) return;
    const parent = path.slice(0, path.length - currentName.length - 1);
    try {
      await invoke("rename_path", { from: path, to: `${parent}/${name}` });
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
      await invoke("delete_path", { path });
      onFileRemoved(path);
      refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>FILES</span>
        <div className="tree-header-actions">
          <button
            className="tree-add-btn"
            onClick={() => createFileIn(selectedDir)}
            title="New file"
          >
            File+
          </button>
          <button
            className="tree-add-btn"
            onClick={() => createFolderIn(selectedDir)}
            title="New folder"
          >
            Folder+
          </button>
        </div>
      </div>
      <div
        className="file-tree-body"
        onClick={handleEmptyAreaClick}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setSelectedDir(rootDir);
            openMenuAt(e.clientX, e.clientY);
          }
        }}
      >
        {error && <div className="tree-error">{error}</div>}
        {tree.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            activePath={activePath}
            selectedDir={selectedDir}
            onOpenFile={onOpenFile}
            onSelectDir={setSelectedDir}
            onContextMenu={handleRowContextMenu}
            depth={0}
          />
        ))}
      </div>

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
