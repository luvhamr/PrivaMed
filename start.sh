#!/usr/bin/env bash
set -euo pipefail

# Change this if you keep the script somewhere else
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GANACHE_PORT=8545
CHAIN_ID=1337

PIDS=()

log() {
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "----------------------------------------"
}

start_bg() {
  local name="$1"
  shift
  log "Starting $name: $*"
  "$@" &
  local pid=$!
  PIDS+=("$pid")
  echo "$name started with PID $pid"
}

cleanup() {
  echo ""
  echo "Stopping all background processes..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Killing PID $pid"
      kill "$pid" 2>/dev/null || true
    fi
  done
  echo "Done. Exiting."
  exit 0
}

trap cleanup SIGINT SIGTERM

log "Project root: $PROJECT_ROOT"

# 1) Start Ganache
log "Starting Ganache on port ${GANACHE_PORT} (chainId=${CHAIN_ID}, networkId=${CHAIN_ID})"
start_bg "Ganache" \
  ganache -p "${GANACHE_PORT}" --chain.chainId "${CHAIN_ID}" --chain.networkId "${CHAIN_ID}"

# Give Ganache a moment to boot up
sleep 5

# 2) Compile + migrate contracts
log "Compiling contracts with Truffle..."
cd "$PROJECT_ROOT"
npx truffle compile

log "Migrating contracts to development network..."
npx truffle migrate --reset --network development

# 3) Start IPFS daemon (from backend/)
log "Starting IPFS daemon..."
cd "$PROJECT_ROOT/backend"
start_bg "IPFS daemon" \
  ipfs daemon

# Give IPFS time to come up
sleep 5

# 4) Start backend dev server
log "Starting backend dev server (npm run dev)..."
start_bg "Backend dev" \
  npm run dev

# 5) Start client (React app)
log "Starting client (npm start)..."
cd "$PROJECT_ROOT/client"
start_bg "Client" \
  npm start

log "All services started. Press Ctrl+C to stop everything."

# Wait forever until Ctrl+C
wait
