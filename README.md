# LocalTeX

A desktop LaTeX IDE: a live editor, a real LaTeX compiler, and a real Linux
terminal, all in one window — with no cloud dependency and no full TeX Live
install required.

Built with [Tauri](https://tauri.app) (Rust) + React, so it ships as a single
small native binary instead of an Electron-sized bundle.

## Features

- **Live LaTeX editor** — CodeMirror 6 with LaTeX syntax highlighting,
  autosave, undo/redo, and find/replace.
- **Real compiler** — uses [Tectonic](https://tectonic-typesetting.github.io/),
  a self-contained LaTeX engine, so there's no multi-gigabyte TeX Live
  install. Compile status and errors show inline; the log only pops up
  automatically when a compile actually fails.
- **Real terminal** — a genuine PTY-backed shell (via `portable-pty`) embedded
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

Requires a Debian/Ubuntu-based Linux system (apt-based). The installer sets
up all build dependencies, Rust, Tectonic, builds the app, and installs it —
one command:

```bash
git clone https://github.com/sayedshaun/localtex.git
cd localtex
./install.sh
```

This installs a `.deb` package system-wide; launch it from your application
menu, or run `localtex` from a terminal.

## Development

```bash
npm install
npm run tauri dev
```

To build a release `.deb` yourself:

```bash
npm run tauri build -- --bundles deb
```

### Requirements for building from source

- Node.js 18+
- Rust (via [rustup](https://rustup.rs))
- Linux build deps: `pkg-config`, `libdbus-1-dev`, `libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`
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
src-tauri/             Rust backend
  src/
    pty.rs             Real PTY terminal sessions
    compile.rs         Tectonic compile + file read/write commands
    fsops.rs           File tree listing, create/rename/delete
    lib.rs             Command registration + WebKitGTK zoom-gesture fix
install.sh             One-command installer
```

## Contributing

This is an open-source project — issues and pull requests are welcome.

## License

[MIT](LICENSE)
