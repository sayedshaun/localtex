const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const crypto = require("crypto");
const zlib = require("zlib");
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

// ---- filesystem / projects ----

function projectsRootDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error("HOME not set");
  return path.join(home, "LocalTeX-Projects");
}

function findMainTex(projectDir) {
  const preferred = path.join(projectDir, "main.tex");
  if (fs.existsSync(preferred)) return preferred;
  const texFile = fs
    .readdirSync(projectDir)
    .find((name) => name.toLowerCase().endsWith(".tex"));
  return texFile ? path.join(projectDir, texFile) : null;
}

ipcMain.handle("ensure-projects-root", () => {
  const root = projectsRootDir();
  const rootExisted = fs.existsSync(root);
  fs.mkdirSync(root, { recursive: true });

  if (!rootExisted) {
    // First run under the new multi-project layout: bring the old
    // single-workspace install forward as its first project instead of
    // silently orphaning it.
    const home = process.env.HOME || process.env.USERPROFILE;
    const legacyDir = path.join(home, "localtex-workspace");
    if (fs.existsSync(legacyDir)) {
      fs.renameSync(legacyDir, path.join(root, "localtex-workspace"));
    } else {
      const dir = path.join(root, "my-first-project");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "main.tex"), STARTER_TEX);
    }
  }

  return { root };
});

ipcMain.handle("list-projects", () => {
  const root = projectsRootDir();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((name) => !name.startsWith(".") && fs.statSync(path.join(root, name)).isDirectory())
    .map((name) => {
      const dir = path.join(root, name);
      const texPath = findMainTex(dir);
      return {
        name,
        dir,
        texPath,
        modifiedMs: fs.statSync(dir).mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedMs - a.modifiedMs);
});

ipcMain.handle("create-project", (_e, name) => {
  const root = projectsRootDir();
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) {
    throw new Error("a project with that name already exists");
  }
  fs.mkdirSync(dir, { recursive: true });
  const texPath = path.join(dir, "main.tex");
  fs.writeFileSync(texPath, STARTER_TEX);
  return { name, dir, texPath, modifiedMs: fs.statSync(dir).mtimeMs };
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

ipcMain.handle("upload-file", async (_e, dir) => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return;
  for (const src of result.filePaths) {
    fs.copyFileSync(src, path.join(dir, path.basename(src)));
  }
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
      ["--keep-logs", "--synctex", "--outdir", dir, fileName],
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

// ---- synctex ----

function parseSynctex(gzPath) {
  const raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf-8");
  const lines = raw.split("\n");
  const inputs = {};
  const records = [];
  const pageStack = [];
  let inContent = false;
  const inputRe = /^Input:(\d+):(.*)$/;
  const recordRe = /^\D{0,2}(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const inputMatch = line.match(inputRe);
    if (inputMatch) {
      inputs[inputMatch[1]] = inputMatch[2];
      continue;
    }
    if (line === "Content:") {
      inContent = true;
      continue;
    }
    if (line === "Postamble:") {
      inContent = false;
      continue;
    }
    if (!inContent) continue;

    const openPage = line.match(/^\{(\d+)/);
    if (openPage) {
      pageStack.push(parseInt(openPage[1], 10));
      continue;
    }
    if (/^\}\d+/.test(line)) {
      pageStack.pop();
      continue;
    }
    if (pageStack.length === 0) continue;

    const m = line.match(recordRe);
    if (m) {
      const w = m[5] !== undefined ? parseInt(m[5], 10) : 0;
      const h = m[6] !== undefined ? parseInt(m[6], 10) : 0;
      records.push({
        fileId: m[1],
        line: parseInt(m[2], 10),
        x: parseInt(m[3], 10),
        y: parseInt(m[4], 10),
        area: Math.abs(w * h),
        page: pageStack[pageStack.length - 1],
      });
    }
  }

  return { inputs, records };
}

function findForwardTarget(parsed, fileId, targetLine) {
  for (let delta = 0; delta <= 200; delta++) {
    const candidateLines =
      delta === 0 ? [targetLine] : [targetLine - delta, targetLine + delta];
    for (const candidateLine of candidateLines) {
      const candidates = parsed.records.filter(
        (r) => r.fileId === fileId && r.line === candidateLine,
      );
      if (candidates.length) {
        candidates.sort((a, b) => a.area - b.area);
        return candidates[0];
      }
    }
  }
  return null;
}

function findReverseTarget(parsed, page, xSp, ySp) {
  let best = null;
  let bestDist = Infinity;
  for (const r of parsed.records) {
    if (r.page !== page) continue;
    const dx = r.x - xSp;
    const dy = r.y - ySp;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return best;
}

ipcMain.handle("sync-forward", (_e, texPath, line) => {
  const gzPath = texPath.replace(/\.tex$/, ".synctex.gz");
  if (!fs.existsSync(gzPath)) return null;
  const parsed = parseSynctex(gzPath);
  const fileId = Object.keys(parsed.inputs).find(
    (id) => path.resolve(parsed.inputs[id]) === path.resolve(texPath),
  );
  if (!fileId) return null;
  const target = findForwardTarget(parsed, fileId, line);
  if (!target) return null;
  return { page: target.page, x: target.x / 65536, y: target.y / 65536 };
});

ipcMain.handle("sync-reverse", (_e, texPath, page, xPt, yPt) => {
  const gzPath = texPath.replace(/\.tex$/, ".synctex.gz");
  if (!fs.existsSync(gzPath)) return null;
  const parsed = parseSynctex(gzPath);
  const target = findReverseTarget(parsed, page, xPt * 65536, yPt * 65536);
  if (!target) return null;
  const filePath = parsed.inputs[target.fileId];
  if (!filePath) return null;
  return { path: path.resolve(filePath), line: target.line };
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
