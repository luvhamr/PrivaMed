#!/usr/bin/env bash
# Install project dependencies for PrivaMed (Ganache, Truffle & test libs, IPFS Kubo)
# Usage: chmod +x setup.sh && ./setup.sh
set -euo pipefail

GANACHE_VERSION="7.9.1"
KUBO_VERSION="0.29.0"
KUBO_OS="linux-amd64"
KUBO_TARBALL="kubo_v${KUBO_VERSION}_${KUBO_OS}.tar.gz"
KUBO_URL="https://dist.ipfs.tech/kubo/v${KUBO_VERSION}/${KUBO_TARBALL}"

# Helpers
info() { printf "\n[INFO] %s\n" "$*"; }
warn() { printf "\n[WARN] %s\n" "$*" >&2; }
err() {
    printf "\n[ERROR] %s\n" "$*" >&2
    exit 1
}

# Basic environment checks
if ! command -v node >/dev/null 2>&1; then
    err "node not found. Please install Node.js (v14+ recommended) and npm before continuing."
fi

if ! command -v npm >/dev/null 2>&1; then
    err "npm not found. Please install npm before continuing."
fi

OS="$(uname -s)"
ARCH="$(uname -m)"
if [ "${OS}" != "Linux" ]; then
    warn "This script is tested for Linux (x86_64). Detected OS: ${OS}. Proceeding, but IPFS installation step may not work."
fi
if [ "${ARCH}" != "x86_64" ] && [ "${ARCH}" != "amd64" ]; then
    warn "Detected architecture ${ARCH}. The provided Kubo binary (${KUBO_OS}) may not match your system."
fi

# 1) Install ganache globally
info "Installing Ganache v${GANACHE_VERSION} globally..."
npm install -g "ganache@${GANACHE_VERSION}"

# Verify ganache install
if command -v ganache >/dev/null 2>&1; then
    info "Ganache installed: $(ganache --version 2>/dev/null || true)"
else
    warn "ganache command not found after installation. You may need to restart your shell."
fi

# 2) Ensure package.json exists
if [ ! -f package.json ]; then
    info "No package.json found. Initializing npm project (npm init -y)..."
    npm init -y
fi

# 3) Install truffle & testing libraries as dev dependencies
info "Installing Truffle and test dependencies as devDependencies..."
npm install --save-dev truffle chai chai-as-promised chai-bn @openzeppelin/test-helpers truffle-assertions

info "Installed dev dependencies listed in package.json."

# 4) Install IPFS Kubo (download, extract, run install.sh)
info "Installing IPFS Kubo v${KUBO_VERSION}..."
TMP_DIR="$(mktemp -d)"
cd "${TMP_DIR}"

# Use wget or curl
if command -v wget >/dev/null 2>&1; then
    wget -q "${KUBO_URL}" -O "${KUBO_TARBALL}"
elif command -v curl >/dev/null 2>&1; then
    curl -sSL "${KUBO_URL}" -o "${KUBO_TARBALL}"
else
    err "Neither wget nor curl is available to download IPFS. Please install one of them."
fi

info "Extracting ${KUBO_TARBALL}..."
tar -xzf "${KUBO_TARBALL}"

EXTRACTED_DIR="$(tar -tf "${KUBO_TARBALL}" | head -1 | cut -f1 -d"/")"
if [ -z "${EXTRACTED_DIR}" ]; then
    err "Failed to determine extracted directory for ${KUBO_TARBALL}."
fi

cd "${EXTRACTED_DIR}"

if [ ! -f install.sh ]; then
    err "install.sh not found in the extracted IPFS archive."
fi

info "Running IPFS install script (requires sudo) ..."
sudo bash install.sh

# cleanup tarball and temp dir
cd /
rm -rf "${TMP_DIR}"

# 5) Initialize IPFS
if ! command -v ipfs >/dev/null 2>&1; then
    warn "ipfs binary not found in PATH after install. You may need to log out/in or add /usr/local/bin to PATH."
else
    if [ ! -d "${HOME}/.ipfs" ]; then
        info "Initializing IPFS repository (ipfs init)..."
        ipfs init
    else
        info "IPFS repo already initialized at ${HOME}/.ipfs"
    fi

    # Start ipfs daemon in background (non-blocking); logs to ./ipfs-daemon.log
    info "Starting ipfs daemon in background. Output is redirected to ./ipfs-daemon.log"
    # Use nohup so the process survives shell exit; only start if not already running
    if pgrep -f "ipfs daemon" >/dev/null 2>&1; then
        info "An ipfs daemon process appears to be running already; skipping start."
    else
        nohup ipfs daemon >ipfs-daemon.log 2>&1 &
        sleep 1
        IPFS_PID="$!"
        info "IPFS daemon started with PID ${IPFS_PID}. Check ipfs-daemon.log for logs."
    fi
fi

info "Installation complete.

Summary:
- Ganache v${GANACHE_VERSION} installed globally.
- Truffle and test libs added to devDependencies in package.json.
- IPFS Kubo v${KUBO_VERSION} installed; repo initialized and daemon started (if possible).

Notes:
- If you prefer to run the IPFS daemon interactively, run: ipfs daemon
- On non-Linux systems adjust the Kubo download URL/asset for your OS/arch.
- If any step failed due to permissions, re-run the script with an account that can use sudo for the IPFS install step."

exit 0
