#!/usr/bin/env bash
# LocalTeX installer — sets up build deps, builds the app, and installs it.
#
# Usage:
#   ./install.sh
#   curl -fsSL <raw-url>/install.sh | bash
#
set -euo pipefail

REPO_URL="${LOCALTEX_REPO_URL:-}"
INSTALL_DIR="${LOCALTEX_INSTALL_DIR:-$HOME/.local/share/localtex}"
BIN_DIR="$HOME/.local/bin"
APP_ID="com.localtex.app"

log() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

require_linux_apt() {
    [ "$(uname -s)" = "Linux" ] || die "this installer currently supports Linux only"
    command_exists apt-get || die "this installer currently supports apt-based distros only"
}

install_system_packages() {
    log "installing system build dependencies (sudo required)"
    sudo apt-get update -y
    sudo apt-get install -y \
        curl \
        build-essential \
        pkg-config \
        libssl-dev \
        libdbus-1-dev \
        libwebkit2gtk-4.1-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        patchelf
}

install_rust() {
    if command_exists cargo; then
        log "rust already installed ($(cargo --version))"
        return
    fi
    log "installing rust (rustup)"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
}

install_node() {
    if command_exists node && command_exists npm; then
        log "node already installed ($(node --version))"
        return
    fi
    die "node.js (>=18) is required but was not found. Install it first (e.g. via nvm) and re-run this script."
}

install_tectonic() {
    if command_exists tectonic; then
        log "tectonic already installed ($(tectonic --version))"
        return
    fi
    log "installing tectonic (self-contained LaTeX engine)"
    mkdir -p "$BIN_DIR"
    ( cd "$BIN_DIR" && curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh )
    chmod +x "$BIN_DIR/tectonic"
}

fetch_source() {
    if [ -f "./src-tauri/tauri.conf.json" ]; then
        log "using local source tree: $(pwd)"
        PROJECT_DIR="$(pwd)"
        return
    fi

    [ -n "$REPO_URL" ] || die "run this script from inside the localtex source tree, or set LOCALTEX_REPO_URL"
    log "cloning $REPO_URL"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    PROJECT_DIR="$INSTALL_DIR"
}

build_app() {
    log "installing npm dependencies"
    ( cd "$PROJECT_DIR" && npm install )

    log "building LocalTeX (release, this can take a few minutes the first time)"
    source "$HOME/.cargo/env"
    ( cd "$PROJECT_DIR" && npm run tauri build -- --bundles deb )
}

install_bundle() {
    local deb
    deb=$(find "$PROJECT_DIR/src-tauri/target/release/bundle/deb" -name '*.deb' | head -n1)
    [ -n "$deb" ] || die "build did not produce a .deb bundle"

    log "installing $deb (sudo required)"
    sudo dpkg -i "$deb" || sudo apt-get install -f -y
}

main() {
    require_linux_apt
    install_system_packages
    install_rust
    install_node
    install_tectonic
    fetch_source
    build_app
    install_bundle

    log "done — launch LocalTeX from your application menu, or run: localtex"
}

main "$@"
