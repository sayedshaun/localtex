#!/usr/bin/env bash
# LocalTeX uninstaller — removes the installed package and, optionally, your
# workspace and the standalone tectonic binary.
#
# Usage:
#   ./uninstall.sh
#   curl -fsSL https://raw.githubusercontent.com/sayedshaun/localtex/main/uninstall.sh | bash
#
set -euo pipefail

WORKSPACE_DIR="$HOME/localtex-workspace"
TECTONIC_BIN="$HOME/.local/bin/tectonic"

log() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$1"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

remove_package() {
    if ! dpkg -s localtex >/dev/null 2>&1; then
        warn "localtex package is not installed (skipping)"
        return
    fi
    log "removing localtex package (sudo required)"
    sudo apt-get remove -y localtex
}

remove_workspace() {
    [ -d "$WORKSPACE_DIR" ] || return
    if [ -t 0 ]; then
        read -r -p "Delete your workspace at $WORKSPACE_DIR too? [y/N] " reply
        case "$reply" in
            [yY]|[yY][eE][sS])
                rm -rf "$WORKSPACE_DIR"
                log "removed $WORKSPACE_DIR"
                ;;
            *)
                log "keeping $WORKSPACE_DIR"
                ;;
        esac
    else
        warn "not a terminal (e.g. running via curl | bash) — keeping $WORKSPACE_DIR"
        warn "remove it yourself with: rm -rf $WORKSPACE_DIR"
    fi
}

remove_tectonic() {
    [ -f "$TECTONIC_BIN" ] || return
    if command_exists tectonic && [ "$(command -v tectonic)" != "$TECTONIC_BIN" ]; then
        warn "a different tectonic is on PATH; leaving $TECTONIC_BIN alone"
        return
    fi
    rm -f "$TECTONIC_BIN"
    log "removed $TECTONIC_BIN"
}

main() {
    remove_package
    remove_workspace
    remove_tectonic
    log "done"
}

main "$@"
