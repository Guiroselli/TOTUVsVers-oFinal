#!/usr/bin/env bash
# Script de inicialização dev do Proton Flow (Linux / macOS / Git Bash)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

python3 "$SCRIPT_DIR/start_dev.py" "$@"
