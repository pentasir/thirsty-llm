#!/usr/bin/env bash
# Water tracker — Stop hook
# Receives the Claude Code Stop event payload on stdin.
# Passes it to log.mjs which reads the transcript and appends raw token counts
# to ~/.claude/water-log.jsonl. Errors are written to ~/.claude/water-log.err.
# Never exits non-zero — must not interrupt Claude Code.
#
# Platform: Unix/macOS. On Windows, install.ps1 registers `node lib/log.mjs`
# directly (no Bash wrapper needed) — this script is not used there.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERR_LOG="$HOME/.claude/water-log.err"

PAYLOAD=$(cat)

if ! command -v node &>/dev/null; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) hook.sh: node not found on PATH" >> "$ERR_LOG"
  exit 0
fi

echo "$PAYLOAD" | node "${SCRIPT_DIR}/lib/log.mjs" 2>>"$ERR_LOG" || true
