const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  ensureProjectsRoot: () => ipcRenderer.invoke("ensure-projects-root"),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  createProject: (name, lang) => ipcRenderer.invoke("create-project", name, lang),
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
  searchProject: (root, query) => ipcRenderer.invoke("search-project", root, query),
  createFile: (path) => ipcRenderer.invoke("create-file", path),
  createFolder: (path) => ipcRenderer.invoke("create-folder", path),
  renamePath: (from, to) => ipcRenderer.invoke("rename-path", from, to),
  deletePath: (path) => ipcRenderer.invoke("delete-path", path),
  uploadFile: (dir) => ipcRenderer.invoke("upload-file", dir),

  // Everyday operations only. Anything needing credentials (push/pull/clone)
  // stays in the terminal, where git can prompt interactively.
  gitStatus: (dir) => ipcRenderer.invoke("git-status", dir),
  gitDiff: (dir, path, staged) => ipcRenderer.invoke("git-diff", dir, path, staged),
  gitHeadFile: (dir, relPath) => ipcRenderer.invoke("git-head-file", dir, relPath),
  gitHeadMessage: (dir) => ipcRenderer.invoke("git-head-message", dir),
  gitInit: (dir) => ipcRenderer.invoke("git-init", dir),
  gitStage: (dir, paths) => ipcRenderer.invoke("git-stage", dir, paths),
  gitUnstage: (dir, paths) => ipcRenderer.invoke("git-unstage", dir, paths),
  gitDiscard: (dir, paths) => ipcRenderer.invoke("git-discard", dir, paths),
  gitCommit: (dir, message, amend) =>
    ipcRenderer.invoke("git-commit", dir, message, amend),
  gitBranches: (dir) => ipcRenderer.invoke("git-branches", dir),
  gitCheckoutBranch: (dir, branch) =>
    ipcRenderer.invoke("git-checkout-branch", dir, branch),
  gitCreateBranch: (dir, branch) =>
    ipcRenderer.invoke("git-create-branch", dir, branch),
  gitStashList: (dir) => ipcRenderer.invoke("git-stash-list", dir),
  gitStashPush: (dir, message) => ipcRenderer.invoke("git-stash-push", dir, message),
  gitStashApply: (dir, ref, drop) =>
    ipcRenderer.invoke("git-stash-apply", dir, ref, drop),
  gitStashDrop: (dir, ref) => ipcRenderer.invoke("git-stash-drop", dir, ref),
  gitLog: (dir, limit) => ipcRenderer.invoke("git-log", dir, limit),

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
