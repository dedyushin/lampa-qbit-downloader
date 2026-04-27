#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

exec /opt/homebrew/bin/node qbit-bridge.js
