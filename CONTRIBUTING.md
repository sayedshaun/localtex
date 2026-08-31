# Contributing to LocalTeX

This is an open-source project — issues and pull requests are welcome.

By submitting a pull request, you agree to license your contribution under
the project's [LICENSE](LICENSE) and grant the maintainer ([Sayed Shaun](https://github.com/sayedshaun))
the right to relicense your contribution, including for commercial use.

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
- `build-essential` (Linux build deps) or Xcode Command Line Tools (macOS)
- [Tectonic](https://tectonic-typesetting.github.io/) on `PATH`

`install.sh` sets all of this up automatically — you only need the above
for building from source yourself.

### Releasing

Pushing a tag matching `v*.*.*` (or publishing a GitHub Release) triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds
the `.deb` on CI and attaches it to the Release automatically:

```bash
git tag v0.1.1
git push origin v0.1.1
```

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
