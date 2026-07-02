#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

for env_file in .env .env.getstv; do
  if [[ -f "$env_file" ]]; then
    set -a
    source "$env_file"
    set +a
  fi
done

exec /opt/homebrew/bin/node qbit-bridge.js
