const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const crypto = require("crypto");
const zlib = require("zlib");
const pty = require("node-pty");

const isDev = !app.isPackaged;

/** Escape a string for embedding as a single-quoted PowerShell literal. */
function psQuote(str) {
  return "'" + String(str).replace(/'/g, "''") + "'";
}

/** Run a PowerShell script (Windows only) and resolve with its stdout. */
function runPowerShell(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout || "");
      },
    );
  });
}

const STARTER_TEX = `\\documentclass{article}
\\title{New Document}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

Hello, \\LaTeX{}!

\\end{document}
`;

// A XeLaTeX + polyglossia starting point for mixing English with any
// non-Latin-script language (Bengali, Arabic, Hindi, Russian, Greek, ...).
// The main document stays in English/Latin Modern (so \\LaTeX{} etc. render
// normally); \\otherlanguage / \\textbengali switch fonts only for the
// passages that need the other script — setting \\setmainfont directly to a
// script-specific font instead would break every Latin character elsewhere
// in the document. (CJK scripts need xeCJK instead of polyglossia — not
// covered by this template.) Requires the named font to be installed on the
// system: tectonic's XeTeX-compatible engine loads fonts via fontconfig.
const STARTER_TEX_MULTILINGUAL = `\\documentclass{article}
\\usepackage{fontspec}
\\usepackage{polyglossia}
\\setmainlanguage{english}

% Swap these two lines for your language + a font that covers its script,
% e.g. \\setotherlanguage{arabic} \\newfontfamily\\arabicfont{Noto Naskh Arabic}
%      \\setotherlanguage{hindi}  \\newfontfamily\\hindifont{Noto Sans Devanagari}
%      \\setotherlanguage{russian}\\newfontfamily\\russianfont{Noto Sans}
\\setotherlanguage{bengali}
\\newfontfamily\\bengalifont{Noto Sans Bengali}

\\title{New Document}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{bengali}
আপনার লেখা এখানে লিখুন। % Write your text here.
\\end{bengali}

Hello, \\LaTeX{} with \\textbengali{বাংলা}!

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
      // Electron 43 defaults this to true; state it so the intent survives an
      // upgrade. The preload only touches contextBridge/ipcRenderer, so it is
      // sandbox-compatible.
      sandbox: true,
    },
  });

  // The renderer only ever loads its own bundle. Deny navigation and popups
  // outright, so a link inside a rendered document cannot move the app window
  // or open a chooser — and any future injection has nowhere to go.
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev && url.startsWith("http://localhost:5173");
    if (!allowed) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Electron's built-in pinch/ctrl-scroll page zoom scales the whole
  // window's content independently of our own canvas-based PDF zoom — with
  // both reacting to the same gesture, the result is a stretched-looking
  // double zoom. Lock the native one out so only the app's own zoom applies.
  win.webContents.setVisualZoomLevelLimits(1, 1);

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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

ipcMain.handle("create-project", (_e, name, lang) => {
  const root = projectsRootDir();
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) {
    throw new Error("a project with that name already exists");
  }
  fs.mkdirSync(dir, { recursive: true });
  const texPath = path.join(dir, "main.tex");
  fs.writeFileSync(texPath, lang === "multilingual" ? STARTER_TEX_MULTILINGUAL : STARTER_TEX);
  return { name, dir, texPath, modifiedMs: fs.statSync(dir).mtimeMs };
});

ipcMain.handle("export-project", async (_e, dir, projectName) => {
  const result = await dialog.showSaveDialog({
    defaultPath: `${projectName}.zip`,
    filters: [{ name: "Zip Archive", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) return null;

  // Zip the project's *contents* (not the folder itself) so main.tex sits at
  // the archive root — the layout Overleaf's own project zips use, and what
  // its "Upload Project" importer expects.
  if (process.platform === "win32") {
    await runPowerShell(
      `Compress-Archive -Path (Join-Path ${psQuote(dir)} '*') -DestinationPath ${psQuote(result.filePath)} -Force`,
    );
  } else {
    await new Promise((resolve, reject) => {
      execFile("zip", ["-r", result.filePath, "."], { cwd: dir }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  return result.filePath;
});

ipcMain.handle("choose-zip-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Zip Archive", extensions: ["zip"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("import-project-zip", async (_e, zipPath, name) => {
  const root = projectsRootDir();
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) {
    throw new Error("a project with that name already exists");
  }
  fs.mkdirSync(dir, { recursive: true });

  try {
    // An archive is untrusted input. Two entry kinds are actively dangerous:
    //
    //  - `.git/`: repo-local config and hooks are executable surface. A
    //    `core.fsmonitor` value runs on a plain `git status`, which the Source
    //    Control panel issues automatically the moment it's opened.
    //  - symlinks: unzip restores them, including absolute targets. A
    //    `notes.tex -> ~/.bashrc` link then reads and (via autosave) writes
    //    straight through to the target.
    //
    // unzip has no per-entry exclude for symlinks, so list first and refuse.
    let listing;
    if (process.platform === "win32") {
      listing = await runPowerShell(
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
          `$zip = [System.IO.Compression.ZipFile]::OpenRead(${psQuote(zipPath)}); ` +
          `try { $zip.Entries | ForEach-Object { $_.FullName } } finally { $zip.Dispose() }`,
      );
    } else {
      listing = await new Promise((resolve, reject) => {
        execFile(
          "unzip",
          // -Z1 lists bare entry names. Note `-l` would override `-1` and give
          // the verbose listing instead, which no longer matches the `.git` test.
          ["-Z1", zipPath],
          { maxBuffer: 8 * 1024 * 1024 },
          (error, stdout) => (error ? reject(error) : resolve(stdout || "")),
        );
      });
    }
    const entries = listing.split("\n").map((l) => l.trim()).filter(Boolean);
    const gitEntry = entries.find(
      (e) => e === ".git" || e.startsWith(".git/") || e.includes("/.git/"),
    );
    if (gitEntry) {
      throw new Error(
        "this archive contains a .git directory, which can carry executable " +
          "git hooks and config. Remove it and re-export, or unzip it yourself " +
          "and open the folder.",
      );
    }

    if (process.platform === "win32") {
      // Expand-Archive does not restore Unix-style symlinks as real
      // filesystem symlinks, so the follow-up findSymlink check below is
      // defense in depth here rather than the primary guard it is on
      // unix, where -X still defers real symlink creation to unzip itself.
      await runPowerShell(
        `Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(dir)} -Force`,
      );
    } else {
      await new Promise((resolve, reject) => {
        // -X so unzip does not restore ownership/permission extras.
        execFile("unzip", ["-o", "-X", zipPath, "-d", dir], (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    // unzip defers symlink creation to the end of extraction, so check after.
    const symlink = findSymlink(dir, dir);
    if (symlink) {
      throw new Error(
        `this archive contains a symbolic link (${path.relative(dir, symlink)}), ` +
          "which could point outside the project. Import refused.",
      );
    }
  } catch (e) {
    // Don't leave a partial project behind; it would also block a retry under
    // the same name.
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }

  const texPath = findMainTex(dir);
  return { name, dir, texPath, modifiedMs: fs.statSync(dir).mtimeMs };
});

/** First symlink found under `dir`, or null. Does not follow directories. */
function findSymlink(dir, root, depth = 0) {
  if (depth > MAX_TREE_DEPTH) return null;
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of names) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return full;
    if (entry.isDirectory()) {
      const found = findSymlink(full, root, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

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

// Both walkers run synchronously on the main process, so a symlink loop
// (`loop -> .`) or a pathological nesting depth would freeze the whole app,
// not just one renderer task. Cap the depth and never follow a link.
const MAX_TREE_DEPTH = 32;

function readDirEntry(dirPath, depth = 0) {
  if (depth > MAX_TREE_DEPTH) return [];
  const names = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && !e.isSymbolicLink());
  const entries = names.map((entry) => {
    const name = entry.name;
    const entryPath = path.join(dirPath, name);
    const isDir = entry.isDirectory();
    return {
      name,
      path: entryPath,
      is_dir: isDir,
      children: isDir ? readDirEntry(entryPath, depth + 1) : null,
    };
  });
  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return entries;
}

ipcMain.handle("list-project-tree", (_e, root) => readDirEntry(root));

// ---- project-wide search ----

const SEARCH_SKIP_EXTENSIONS = new Set([
  "gz", "zip", "bin", "otf", "ttf", "woff", "woff2", "ico", "mp3", "mp4",
  "class", "o", "exe", "dll", "pyc", "pdf", "png", "jpg", "jpeg", "gif",
  "bmp", "webp",
]);

function walkFiles(dir, out, depth = 0) {
  if (depth > MAX_TREE_DEPTH) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith(".") || entry.isSymbolicLink()) continue;
    const full = path.join(dir, name);
    if (entry.isDirectory()) {
      walkFiles(full, out, depth + 1);
    } else {
      out.push(full);
    }
  }
}

ipcMain.handle("search-project", (_e, root, query) => {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return [];

  const files = [];
  walkFiles(root, files);

  const MAX_MATCHES = 200;
  const matches = [];
  for (const filePath of files) {
    if (matches.length >= MAX_MATCHES) break;
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (SEARCH_SKIP_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push({ path: filePath, line: i + 1, text: lines[i].trim().slice(0, 200) });
      }
    }
  }
  return matches;
});

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

// ---- git ----
//
// Everyday operations (stage, commit, branch, stash) live here; the terminal
// stays the escape hatch for everything else. Anything needing credentials —
// push, pull, clone — is deliberately absent: it belongs in the PTY, where
// git can prompt for passphrases and tokens interactively.

// LaTeX builds litter the project with artifacts; a repo that tracks them is
// unusable. Seed .gitignore on init so the first status is just the sources.
const GITIGNORE = `# LaTeX build artifacts
*.aux
*.bbl
*.blg
*.fdb_latexmk
*.fls
*.lof
*.log
*.lot
*.out
*.synctex.gz
*.toc
*.nav
*.snm
*.vrb
*.pdf
`;

/*
 * Repo-local config can make git execute commands: `core.fsmonitor` runs on a
 * plain `git status`, and clean/smudge filters run on checkout. A project
 * folder can arrive from anywhere (an imported zip, a shared directory), so
 * every invocation disables those hooks rather than trusting the repo. Commit
 * hooks are left alone: those live in `.git/hooks`, which `import-project-zip`
 * refuses to extract.
 */
const GIT_SAFE_FLAGS = [
  "-c",
  "core.fsmonitor=",
  "-c",
  `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
  "-c",
  "protocol.ext.allow=never",
];

function runGit(dir, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      [...GIT_SAFE_FLAGS, ...args],
      { cwd: dir, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout || "",
          stderr: stderr || (error ? String(error.message) : ""),
        });
      },
    );
  });
}

// Two mutating git commands at once fight over .git/index.lock, and the user's
// own terminal is a third writer we don't control. Serialising our own calls
// removes the collisions we *can* prevent and makes lock errors rare enough to
// just report.
let gitQueue = Promise.resolve();

function git(dir, args) {
  const result = gitQueue.then(() => runGit(dir, args));
  // Keep the chain alive regardless of individual outcomes.
  gitQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Resolve `relPath` inside `root`, refusing anything that escapes it. Guards the
 * one handler that destroys data outside git's control; `path.join` alone is not
 * enough because it happily normalises `../../..` into a real escape.
 */
function resolveInside(root, relPath) {
  const base = fs.realpathSync(root);
  const target = path.resolve(base, relPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`refusing to touch a path outside the project: ${relPath}`);
  }
  return target;
}

/** Throw with git's own message, which is usually the most useful one. */
function assertGit(result, fallback) {
  if (!result.ok) throw new Error(result.stderr || result.stdout || fallback);
  return result;
}

async function gitBranchName(dir) {
  // symbolic-ref first: `rev-parse --abbrev-ref HEAD` *succeeds* with the
  // literal string "HEAD" on a detached HEAD, which would otherwise be shown
  // as a branch named HEAD (and committed onto during a rebase).
  const symbolic = await git(dir, ["symbolic-ref", "-q", "--short", "HEAD"]);
  if (symbolic.ok && symbolic.stdout.trim()) return symbolic.stdout.trim();
  // Detached: report the short commit so the UI can say where we are.
  const short = await git(dir, ["rev-parse", "--short", "HEAD"]);
  return short.ok ? `(detached at ${short.stdout.trim()})` : null;
}

ipcMain.handle("git-status", async (_e, dir) => {
  const inside = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { isRepo: false, branch: null, files: [], hasCommits: false };
  }

  // Porcelain paths are relative to the repository root, but every handler runs
  // with cwd = the project dir. If the project merely sits *inside* a larger
  // repo (e.g. the user ran `git init` in ~/LocalTeX-Projects), those paths
  // wouldn't resolve here and stage/discard would target the wrong files — or
  // silently no-op. Report "not a repo" rather than acting on bad paths.
  const toplevel = await git(dir, ["rev-parse", "--show-toplevel"]);
  const root = toplevel.ok ? toplevel.stdout.trim() : null;
  let sameRoot = false;
  try {
    sameRoot = !!root && fs.realpathSync(root) === fs.realpathSync(dir);
  } catch {
    sameRoot = false;
  }
  if (!sameRoot) {
    return {
      isRepo: false,
      branch: null,
      files: [],
      hasCommits: false,
      nestedIn: root,
    };
  }

  // -z + porcelain v1 so filenames with spaces or quotes survive intact.
  const status = await git(dir, ["status", "--porcelain=v1", "-z", "-uall"]);
  const files = [];
  if (status.ok) {
    const parts = status.stdout.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (entry.length < 4) continue;
      const index = entry[0];
      const worktree = entry[1];
      let filePath = entry.slice(3);
      // Renames/copies emit the source path as a second NUL-separated field.
      let origPath = null;
      if (index === "R" || index === "C") {
        origPath = parts[++i] ?? null;
      }
      files.push({ path: filePath, origPath, index, worktree });
    }
  }

  const revs = await git(dir, ["rev-parse", "--verify", "HEAD"]);
  return {
    isRepo: true,
    branch: await gitBranchName(dir),
    files,
    hasCommits: revs.ok,
  };
});

ipcMain.handle("git-diff", async (_e, dir, filePath, staged) => {
  const args = ["diff", "--no-color"];
  if (staged) args.push("--cached");
  args.push("--", filePath);
  const result = await git(dir, args);
  if (result.ok && result.stdout.trim()) return result.stdout;

  // Untracked files have no diff; show the file contents as all-added instead.
  const tracked = await git(dir, ["ls-files", "--error-unmatch", "--", filePath]);
  if (!tracked.ok) {
    try {
      const target = resolveInside(dir, filePath);
      const stat = fs.statSync(target);
      if (stat.isDirectory()) return "";
      // Guard the size: git itself never hands us a whole file here, and a
      // dropped-in figure would otherwise be decoded and shipped over IPC as
      // hundreds of thousands of replacement-character lines.
      const MAX_UNTRACKED_DIFF = 512 * 1024;
      if (stat.size > MAX_UNTRACKED_DIFF) {
        return `Untracked file (${Math.round(stat.size / 1024)} KB) — too large to preview.`;
      }
      const buf = fs.readFileSync(target);
      // A NUL byte in the first block is git's own binary heuristic.
      if (buf.subarray(0, 8000).includes(0)) {
        return "Binary file — no textual diff to show.";
      }
      const body = buf.toString("utf-8");
      // Drop the phantom final element from a trailing newline, so the diff
      // doesn't end in a bare "+".
      const lines = body.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      return lines.map((l) => `+${l}`).join("\n");
    } catch {
      return "";
    }
  }
  return result.stdout;
});

ipcMain.handle("git-log", async (_e, dir, limit) => {
  const result = await git(dir, [
    "log",
    `-n${limit ?? 20}`,
    "--pretty=format:%h%x00%an%x00%ar%x00%s",
  ]);
  if (!result.ok || !result.stdout.trim()) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, when, subject] = line.split("\0");
      return { hash, author, when, subject };
    });
});

/**
 * File contents at HEAD, for the editor's change gutter. `null` means the file
 * isn't in HEAD at all (new file), which the gutter renders as all-added.
 */
ipcMain.handle("git-head-file", async (_e, dir, relPath) => {
  const result = await git(dir, ["show", `HEAD:${relPath}`]);
  return result.ok ? result.stdout : null;
});

// ---- git: mutating operations ----

ipcMain.handle("git-init", async (_e, dir) => {
  assertGit(await git(dir, ["init"]), "git init failed");

  const ignorePath = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignorePath)) fs.writeFileSync(ignorePath, GITIGNORE);

  // A fresh repo with no identity fails at commit time with a confusing
  // error, so fall back to a local one when the user has no global config.
  // Check both keys independently: a global config with a name but no email is
  // common, and it fails at commit time with "unable to auto-detect email".
  const name = await git(dir, ["config", "user.name"]);
  if (!name.ok || !name.stdout.trim()) {
    await git(dir, ["config", "user.name", "LocalTeX"]);
  }
  const email = await git(dir, ["config", "user.email"]);
  if (!email.ok || !email.stdout.trim()) {
    await git(dir, ["config", "user.email", "localtex@localhost"]);
  }
});

ipcMain.handle("git-stage", async (_e, dir, filePaths) => {
  if (!filePaths.length) return;
  assertGit(await git(dir, ["add", "--", ...filePaths]), "git add failed");
});

ipcMain.handle("git-unstage", async (_e, dir, filePaths) => {
  if (!filePaths.length) return;
  // With no commits yet there's no HEAD to reset against, so empty the index
  // entry instead — plain `reset` fails on an unborn branch.
  const hasHead = await git(dir, ["rev-parse", "--verify", "HEAD"]);
  const args = hasHead.ok
    ? ["reset", "-q", "--", ...filePaths]
    : ["rm", "--cached", "-q", "--", ...filePaths];
  assertGit(await git(dir, args), "git reset failed");
});

ipcMain.handle("git-discard", async (_e, dir, filePaths) => {
  if (!filePaths.length) return;
  const hasHead = await git(dir, ["rev-parse", "--verify", "HEAD"]);

  for (const filePath of filePaths) {
    // `ls-files --error-unmatch` matches anything in the *index*, so a newly
    // added file looks "tracked" — but `checkout HEAD -- f` cannot restore a
    // path that isn't in HEAD, and fails with a raw pathspec error. Ask
    // whether HEAD knows the path, not whether the index does.
    const inHead = hasHead.ok
      ? await git(dir, ["cat-file", "-e", `HEAD:${filePath}`])
      : { ok: false };

    if (inHead.ok) {
      // Reset index and worktree together: a staged rename otherwise leaves
      // half of itself behind.
      const restored = await git(dir, [
        "restore",
        "--staged",
        "--worktree",
        "--source=HEAD",
        "--",
        filePath,
      ]);
      assertGit(restored, "git restore failed");
      continue;
    }

    // Not in HEAD: the file is new. Drop it from the index if it's staged,
    // then remove it from disk.
    const inIndex = await git(dir, ["ls-files", "--error-unmatch", "--", filePath]);
    if (inIndex.ok) {
      assertGit(
        await git(dir, ["rm", "--cached", "-q", "--force", "--", filePath]),
        "git rm --cached failed",
      );
    }
    // resolveInside, not path.join: this is the one handler that destroys data
    // git can't recover, so it must refuse a path that escapes the project.
    const target = resolveInside(dir, filePath);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

ipcMain.handle("git-commit", async (_e, dir, message, amend) => {
  if (!amend) {
    const staged = await git(dir, ["diff", "--cached", "--name-only"]);
    if (staged.ok && !staged.stdout.trim()) {
      throw new Error("nothing staged to commit");
    }
  }
  const args = ["commit", "-m", message];
  if (amend) args.push("--amend");
  assertGit(await git(dir, args), "git commit failed");
});

/** Subject of HEAD, so "amend" can prefill the message being rewritten. */
ipcMain.handle("git-head-message", async (_e, dir) => {
  const result = await git(dir, ["log", "-1", "--pretty=%B"]);
  return result.ok ? result.stdout.trim() : null;
});

ipcMain.handle("git-branches", async (_e, dir) => {
  const result = await git(dir, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%00%(HEAD)",
    "refs/heads",
  ]);
  if (!result.ok || !result.stdout.trim()) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, head] = line.split("\0");
      return { name, current: head === "*" };
    });
});

ipcMain.handle("git-checkout-branch", async (_e, dir, branch) => {
  // `--` so a name that happens to match a path can't make git restore that
  // file and exit 0, which would report a successful "branch switch".
  assertGit(await git(dir, ["checkout", branch, "--"]), "git checkout failed");
});

ipcMain.handle("git-create-branch", async (_e, dir, branch) => {
  assertGit(await git(dir, ["checkout", "-b", branch, "--"]), "git branch failed");
});

ipcMain.handle("git-stash-list", async (_e, dir) => {
  const result = await git(dir, ["stash", "list", "--pretty=%gd%x00%s"]);
  if (!result.ok || !result.stdout.trim()) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, subject] = line.split("\0");
      return { ref, subject };
    });
});

ipcMain.handle("git-stash-push", async (_e, dir, message) => {
  // -u so untracked files come along; otherwise "stash" silently leaves the
  // new chapter file sitting in the worktree.
  const args = ["stash", "push", "-u"];
  if (message) args.push("-m", message);
  const result = await git(dir, args);
  assertGit(result, "git stash failed");
  if (result.stdout.includes("No local changes")) {
    throw new Error("no local changes to stash");
  }
});

ipcMain.handle("git-stash-apply", async (_e, dir, ref, drop) => {
  assertGit(
    await git(dir, [...(drop ? ["stash", "pop"] : ["stash", "apply"]), ref]),
    "git stash apply failed",
  );
});

ipcMain.handle("git-stash-drop", async (_e, dir, ref) => {
  assertGit(await git(dir, ["stash", "drop", ref]), "git stash drop failed");
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
        // If tectonic never even started (e.g. not installed), stdout/stderr
        // are empty and the only information is on the Error object itself —
        // surface that instead of silently reporting an unexplained failure.
        const log = stdout || stderr ? `${stdout}${stderr}` : (error?.message ?? "");
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
  const shell =
    process.platform === "win32"
      ? process.env.COMSPEC || "powershell.exe"
      : process.env.SHELL || "/bin/bash";
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
