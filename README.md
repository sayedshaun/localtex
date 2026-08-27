<div align="center">

<img src="build/icon.png" width="96" height="96" alt="LocalTeX icon" />

# LocalTeX

**Overleaf's editing experience, running entirely on your own machine.**

A live LaTeX editor, a real compiler, and a real terminal — one window, no
cloud, no account, no multi-gigabyte TeX Live install.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Platform: Linux](https://img.shields.io/badge/platform-Linux-orange?logo=linux&logoColor=white)](#install)

[Install](#-install) · [Features](#-features) · [Development](#-development) · [Uninstall](#-uninstall)

</div>

<p align="center">
  <img src="docs/screenshot.png" alt="LocalTeX — editor, outline, terminal, and live PDF preview in one window" width="900" />
</p>

---

## Why LocalTeX?

Overleaf is great until you need it offline, want your files to actually
live on your disk, or just don't want to pay for compile priority on your
own laptop. LocalTeX gives you that same editor-plus-preview workflow,
backed by a real filesystem and a real shell, with nothing running outside
your machine.

## ✨ Features

| | |
|---|---|
| 🏠 **Multi-project dashboard** | An Overleaf-style home screen listing every project under `~/LocalTeX-Projects`, with search, new/delete, and .zip export/import (drop a project straight into Overleaf's "Upload Project", or pull one back out). |
| 📝 **Live editor** | CodeMirror 6 with LaTeX syntax highlighting, autosave, undo/redo, find/replace, a symbol toolbar, and a document outline that jumps the cursor to any section. |
| ⚙️ **Real compiler** | [Tectonic](https://tectonic-typesetting.github.io/) — a self-contained LaTeX engine, so there's no multi-gigabyte TeX Live install. Errors surface inline; the log only pops up when a compile actually fails. |
| 🔗 **SyncTeX** | Click "Sync" to jump the PDF to your cursor's position; double-click the PDF to jump the editor back — both directions, pixel-accurate. |
| 💻 **Real terminal** | A genuine PTY-backed shell (`node-pty`), not a simulation. Dockable to the bottom or side, resizable, closable without killing the session. |
| 📄 **PDF preview** | Rendered with `pdf.js` at supersampled resolution for crisp text. Foldable, resizable split view, plus Ctrl+scroll / touchpad-pinch zoom. |
| 🔍 **Project-wide search** | A VS Code-style search panel — find text across every file in a project, not just the open one. |
| 🗂️ **File tree** | Overleaf-style sidebar — create, rename, drag-and-drop move, and delete via right-click or empty-space click. Foldable and resizable. |
| 🎨 **Themes** | VS Code Dark, Dracula, GNOME, and Light — covers the editor, terminal, and app chrome. |
| 🌐 **Multilingual documents** | A bundled Bengali font plus a XeLaTeX + polyglossia starter template for mixing non-Latin scripts (Bengali, Arabic, Hindi, ...) with regular Latin text in the same document. |
| 🧭 **Menu bar** | File / Edit / Insert / View / Theme, with only commands that actually do something — no dead menu items. |

## 🚀 Install

> Debian/Ubuntu-based Linux (apt-based) only, for now.

```bash
curl -fsSL https://raw.githubusercontent.com/sayedshaun/localtex/main/install.sh | bash
```

That one line installs Node.js build deps and Tectonic, downloads the
Electron runtime, builds LocalTeX, and installs the resulting `.deb`
system-wide. When it's done, launch **LocalTeX** from your application
menu, or run `localtex` from a terminal.

<details>
<summary>Prefer to inspect the script first, or already have the source checked out?</summary>

```bash
git clone https://github.com/sayedshaun/localtex.git
cd localtex
./install.sh
```

</details>

## 🗑️ Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/sayedshaun/localtex/main/uninstall.sh | bash
```

Removes the `localtex` package. It'll ask before touching your
`~/LocalTeX-Projects` project files, and only removes the `tectonic`
binary if `install.sh` was the one that put it there.

## 🛠️ Development

```bash
npm install
npm run electron:dev
```

> `npm install` downloads the Electron runtime itself on first run (a
> prebuilt Chromium/Node binary, fetched from GitHub) — that's the tradeoff
> for not depending on a system WebView, so make sure you're online.

Build a release `.deb` yourself:

```bash
npm run electron:build
```

**Requirements:**

- Node.js 18+
- `build-essential` (Linux build deps)
- [Tectonic](https://tectonic-typesetting.github.io/) on `PATH`

`install.sh` sets all of this up automatically — you only need the above
for building from source yourself.

## 📁 Project layout

```
src/                     React frontend
  components/
    Home.tsx              Multi-project dashboard (list, new, import/export, delete)
    Editor.tsx            CodeMirror-based LaTeX editor
    Terminal.tsx          xterm.js wired to the PTY backend
    PdfPreview.tsx        pdf.js-based PDF viewer, zoom + SyncTeX
    FileTree.tsx          Overleaf-style file browser (context menu, drag-and-drop)
    SearchPanel.tsx        Project-wide text search
    OutlinePanel.tsx       Document outline (jumps the cursor to a section)
    SymbolToolbar.tsx      Bold/italic/math/list/etc. insert toolbar
    MenuBar.tsx            File/Edit/Insert/View/Theme menu bar
    PromptDialog.tsx       Modal text-input dialog (Electron has no window.prompt)
    SplitPane.tsx          Draggable divider (editor/preview, and editor/terminal)
  themes.ts                 Theme definitions (editor, terminal, and app-chrome colors)
  electron-api.d.ts       Type declarations for window.api (IPC bridge)
electron/                Electron main process
  main.cjs                Window creation + all IPC handlers (fs, compile, pty, SyncTeX)
  preload.cjs              contextBridge exposing window.api to the renderer
install.sh               One-command installer
uninstall.sh             One-command uninstaller
```

## 🤝 Contributing

This is an open-source project — issues and pull requests are welcome.

## 📄 License

[MIT](LICENSE)
