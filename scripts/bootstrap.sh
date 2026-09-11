#!/usr/bin/env bash
# One-shot deploy for the OpenCode Telegram Group Topics Bot on Linux/macOS.
# Native install, no Docker, no containers: installs Node.js 20+ via the system
# package manager (or Homebrew on macOS), fetches this repo and runs the
# universal setup (wizard or flags).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/soyjuliyt/opencode-agents-telegram.git}"
ZIP_URL="${ZIP_URL:-https://codeload.github.com/soyjuliyt/opencode-agents-telegram/zip/refs/heads/main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/opencode-telegram-group-topics-bot}"

node_major() {
  node --version 2>/dev/null | sed -E 's/v([0-9]+).*/\1/'
}

have_node20() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node_major)"
  [ -n "$major" ] && [ "$major" -ge 20 ]
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_node() {
  echo "Node.js 20+ not found. Installing natively..."
  if [ "$(uname -s)" = "Darwin" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update -y
    run_root apt-get install -y curl ca-certificates gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | run_root bash -
    run_root apt-get install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    run_root pacman -Sy --noconfirm nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y nodejs npm
  else
    echo "Unsupported package manager. Install Node.js 20+ manually and re-run." >&2
    exit 3
  fi
}

ensure_repo() {
  if [ -f "$INSTALL_DIR/package.json" ]; then
    echo "Repo already present: $INSTALL_DIR"
    return
  fi
  mkdir -p "$INSTALL_DIR"
  if command -v git >/dev/null 2>&1; then
    echo "Cloning $REPO_URL ..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    echo "git not found; downloading the repo archive instead."
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL "$ZIP_URL" -o "$tmp/repo.zip"
    unzip -q "$tmp/repo.zip" -d "$tmp"
    cp -r "$tmp"/opencode-agents-telegram-main/* "$INSTALL_DIR/"
  fi
}

if ! have_node20; then
  install_node
fi
if ! have_node20; then
  echo "Node.js 20+ still not found after install. Open a new shell and re-run." >&2
  exit 4
fi

echo "Using Node: $(node --version)"
ensure_repo

if [ ! -f "$INSTALL_DIR/scripts/setup.mjs" ]; then
  echo "setup.mjs not found in $INSTALL_DIR" >&2
  exit 5
fi

echo "Running universal setup..."
node "$INSTALL_DIR/scripts/setup.mjs" "$@"