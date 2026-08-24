# LocalTeX

A desktop LaTeX IDE: a live editor, a real LaTeX compiler, and a real Linux
terminal, all in one window — with no cloud dependency and no full TeX Live
install required.

Built with [Electron](https://electronjs.org) + React, with a Node.js main
process handling the filesystem, the LaTeX compiler, and the PTY-backed
terminal.

## Features

- **Live LaTeX editor** — CodeMirror 6 with LaTeX syntax highlighting,
  autosave, undo/redo, and find/replace.
- **Real compiler** — uses [Tectonic](https://tectonic-typesetting.github.io/),
  a self-contained LaTeX engine, so there's no multi-gigabyte TeX Live
  install. Compile status and errors show inline; the log only pops up
  automatically when a compile actually fails.
- **Real terminal** — a genuine PTY-backed shell (via `node-pty`) embedded
  in the app, not a simulation. Run `git`, `claude`, or any other CLI tool
  right where you're editing, exactly like VS Code's integrated terminal.
- **PDF preview** — rendered with `pdf.js`, scaled to the pane's width
  (Overleaf-style, not squished). Resizable split between editor and preview,
  plus Ctrl+scroll / touchpad-pinch zoom with its own zoom controls.
- **File tree sidebar** — Overleaf-style file/folder browser: create, rename,
  and delete via right-click (or left-click empty space) context menu.
- **Menu bar** — File / Edit / Insert / View, with only genuinely working
  commands (no dead menu items): new file/folder, open, save, compile, undo,
  redo, find/replace, LaTeX snippet inserts (section, table, figure,
  equation, lists), and sidebar/terminal/zoom toggles.

## Install

Requires a Debian/Ubuntu-based Linux system (apt-based). One command:

```bash
curl -fsSL https://raw.githubusercontent.com/sayedshaun/localtex/main/install.sh | bash
```

This downloads the source, installs Node.js build deps and Tectonic,
downloads the Electron binary, builds LocalTeX, and installs the resulting
`.deb` package system-wide. Launch it from your application menu, or run
`localtex` from a terminal.

Prefer to inspect the script first, or already have the source checked out?

```bash
git clone https://github.com/sayedshaun/localtex.git
cd localtex
./install.sh
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/sayedshaun/localtex/main/uninstall.sh | bash
```

Removes the `localtex` package. It'll ask before deleting your
`~/localtex-workspace` project files, and also removes the `tectonic`
binary if `install.sh` installed it (leaves it alone if you already had
your own on `PATH`).

## Development

```bash
npm install
npm run electron:dev
```

`npm install` downloads the Electron binary itself on first run (a
prebuilt Chromium/Node runtime, fetched from GitHub), so it needs a normal
internet connection — this is the tradeoff for not requiring a system
WebView.

To build a release `.deb` yourself:

```bash
npm run electron:build
```

### Requirements for building from source

- Node.js 18+
- Linux build deps: `build-essential`
- [Tectonic](https://tectonic-typesetting.github.io/) on `PATH` for
  compiling `.tex` files

`install.sh` handles all of the above automatically.

## Project layout

```
src/                   React frontend
  components/
    Editor.tsx         CodeMirror-based LaTeX editor
    Terminal.tsx        xterm.js wired to the PTY backend
    PdfPreview.tsx      pdf.js-based PDF viewer with zoom
    FileTree.tsx        Overleaf-style file browser + context menu
    MenuBar.tsx         File/Edit/Insert/View menu bar
    SplitPane.tsx        Draggable editor/preview divider
  electron-api.d.ts     Type declarations for window.api (IPC bridge)
electron/              Electron main process
  main.cjs              Window creation + all IPC handlers (fs, compile, pty)
  preload.cjs           contextBridge exposing window.api to the renderer
install.sh             One-command installer
```

## Contributing

This is an open-source project — issues and pull requests are welcome.

## License

[MIT](LICENSE)
