const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  ensureProjectsRoot: () => ipcRenderer.invoke("ensure-projects-root"),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  createProject: (name) => ipcRenderer.invoke("create-project", name),
  exportProject: (dir, projectName) =>
    ipcRenderer.invoke("export-project", dir, projectName),
  chooseZipFile: () => ipcRenderer.invoke("choose-zip-file"),
  importProjectZip: (zipPath, name) =>
    ipcRenderer.invoke("import-project-zip", zipPath, name),
  readTextFile: (path) => ipcRenderer.invoke("read-text-file", path),
  writeTextFile: (path, contents) =>
    ipcRenderer.invoke("write-text-file", path, contents),
  readBinaryFileBase64: (path) =>
    ipcRenderer.invoke("read-binary-file-base64", path),
  pathExists: (path) => ipcRenderer.invoke("path-exists", path),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  listProjectTree: (root) => ipcRenderer.invoke("list-project-tree", root),
  createFile: (path) => ipcRenderer.invoke("create-file", path),
  createFolder: (path) => ipcRenderer.invoke("create-folder", path),
  renamePath: (from, to) => ipcRenderer.invoke("rename-path", from, to),
  deletePath: (path) => ipcRenderer.invoke("delete-path", path),
  uploadFile: (dir) => ipcRenderer.invoke("upload-file", dir),

  compileTex: (path) => ipcRenderer.invoke("compile-tex", path),
  syncForward: (texPath, line) =>
    ipcRenderer.invoke("sync-forward", texPath, line),
  syncReverse: (texPath, page, x, y) =>
    ipcRenderer.invoke("sync-reverse", texPath, page, x, y),

  ptySpawn: (opts) => ipcRenderer.invoke("pty-spawn", opts),
  ptyWrite: (id, data) => ipcRenderer.invoke("pty-write", id, data),
  ptyResize: (id, cols, rows) =>
    ipcRenderer.invoke("pty-resize", id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke("pty-kill", id),
  onPtyOutput: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("pty-output", listener);
    return () => ipcRenderer.removeListener("pty-output", listener);
  },
  onPtyExit: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("pty-exit", listener);
    return () => ipcRenderer.removeListener("pty-exit", listener);
  },
});
