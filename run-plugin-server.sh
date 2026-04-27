#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

exec /opt/homebrew/bin/node serve-plugin-only.js
