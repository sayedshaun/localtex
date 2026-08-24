const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const crypto = require("crypto");
const pty = require("node-pty");

const isDev = !app.isPackaged;

const STARTER_TEX = `\\documentclass{article}
\\title{New Document}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

Hello, \\LaTeX{}!

\\end{document}
`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- filesystem / project ----

ipcMain.handle("ensure-default-project", () => {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error("HOME not set");
  const dir = path.join(home, "localtex-workspace");
  fs.mkdirSync(dir, { recursive: true });
  const texPath = path.join(dir, "main.tex");
  if (!fs.existsSync(texPath)) {
    fs.writeFileSync(texPath, STARTER_TEX);
  }
  return { dir, texPath };
});

ipcMain.handle("read-text-file", (_e, filePath) => {
  return fs.readFileSync(filePath, "utf-8");
});

ipcMain.handle("write-text-file", (_e, filePath, contents) => {
  fs.writeFileSync(filePath, contents);
});

ipcMain.handle("read-binary-file-base64", (_e, filePath) => {
  return fs.readFileSync(filePath).toString("base64");
});

ipcMain.handle("path-exists", (_e, targetPath) => {
  return fs.existsSync(targetPath);
});

ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "LaTeX", extensions: ["tex"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ---- file tree ----

function readDirEntry(dirPath) {
  const names = fs.readdirSync(dirPath).filter((n) => !n.startsWith("."));
  const entries = names.map((name) => {
    const entryPath = path.join(dirPath, name);
    const isDir = fs.statSync(entryPath).isDirectory();
    return {
      name,
      path: entryPath,
      is_dir: isDir,
      children: isDir ? readDirEntry(entryPath) : null,
    };
  });
  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return entries;
}

ipcMain.handle("list-project-tree", (_e, root) => readDirEntry(root));

ipcMain.handle("create-file", (_e, filePath) => {
  if (fs.existsSync(filePath)) {
    throw new Error("a file with that name already exists");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
});

ipcMain.handle("create-folder", (_e, folderPath) => {
  fs.mkdirSync(folderPath, { recursive: true });
});

ipcMain.handle("rename-path", (_e, from, to) => {
  if (fs.existsSync(to)) {
    throw new Error("a file or folder with that name already exists");
  }
  fs.renameSync(from, to);
});

ipcMain.handle("delete-path", (_e, targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
});

// ---- compile ----

ipcMain.handle("compile-tex", (_e, texPath) => {
  return new Promise((resolve) => {
    const dir = path.dirname(texPath);
    const fileName = path.basename(texPath);

    execFile(
      "tectonic",
      ["--keep-logs", "--outdir", dir, fileName],
      { cwd: dir },
      (error, stdout, stderr) => {
        const log = `${stdout}${stderr}`;
        const pdfPath = texPath.replace(/\.tex$/, ".pdf");
        const success = !error && fs.existsSync(pdfPath);
        resolve({
          success,
          log,
          pdf_path: success ? pdfPath : null,
        });
      },
    );
  });
});

// ---- pty terminal ----

const ptySessions = new Map();

ipcMain.handle("pty-spawn", (event, { cols, rows, cwd }) => {
  const shell = process.env.SHELL || "/bin/bash";
  const id = crypto.randomUUID();
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: cwd || undefined,
    env: process.env,
  });

  ptySessions.set(id, ptyProcess);

  const sender = event.sender;
  ptyProcess.onData((data) => {
    if (!sender.isDestroyed()) {
      sender.send("pty-output", { id, data });
    }
  });
  ptyProcess.onExit(() => {
    ptySessions.delete(id);
    if (!sender.isDestroyed()) {
      sender.send("pty-exit", { id });
    }
  });

  return id;
});

ipcMain.handle("pty-write", (_e, id, data) => {
  const ptyProcess = ptySessions.get(id);
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.handle("pty-resize", (_e, id, cols, rows) => {
  const ptyProcess = ptySessions.get(id);
  if (ptyProcess) ptyProcess.resize(cols, rows);
});

ipcMain.handle("pty-kill", (_e, id) => {
  const ptyProcess = ptySessions.get(id);
  if (ptyProcess) {
    ptyProcess.kill();
    ptySessions.delete(id);
  }
});
