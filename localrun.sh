#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

PORT="${PORT:-5173}"

if [ ! -d node_modules ]; then
  npm install
fi

npm run dev -- --host 0.0.0.0 --port "${PORT}"
