#!/usr/bin/env bash
#
# thirstyLLM installer
# Deploys the water-tracking skill into ~/.claude and registers the Stop hook.
# Re-runnable (idempotent). Requires: bash + node (already needed by the skill).
#
set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
SKILL_DIR="${CLAUDE_DIR}/skills/water"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "thirstyLLM installer"
echo "  Source: ${SCRIPT_DIR}"
echo "  Target: ${SKILL_DIR}"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ node not found on PATH. Install Node.js first, then re-run." >&2
  exit 1
fi

# 1. Copy skill files
mkdir -p "${SKILL_DIR}/lib"
cp "${SCRIPT_DIR}/skill/SKILL.md"       "${SKILL_DIR}/"
cp "${SCRIPT_DIR}/skill/hook.sh"        "${SKILL_DIR}/"
cp "${SCRIPT_DIR}/skill/methodology.md" "${SKILL_DIR}/"
cp "${SCRIPT_DIR}/skill/lib/"*.mjs      "${SKILL_DIR}/lib/"
chmod +x "${SKILL_DIR}/hook.sh"
echo "  ✓ Skill files copied"

# 2. Copy formula.json (single source of truth) to ~/.claude
cp "${SCRIPT_DIR}/formula.json" "${CLAUDE_DIR}/formula.json"
echo "  ✓ formula.json installed"

# 3. Register the Stop hook in settings.json (idempotent, preserves existing settings)
CLAUDE_DIR="${CLAUDE_DIR}" node <<'NODE'
const fs = require('fs');
const path = require('path');
const claudeDir = process.env.CLAUDE_DIR;
const settingsPath = path.join(claudeDir, 'settings.json');

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* fresh */ }

settings.hooks = settings.hooks || {};
settings.hooks.Stop = settings.hooks.Stop || [];

const already = JSON.stringify(settings.hooks.Stop).includes('skills/water/hook.sh');
if (already) {
  console.log('  • Stop hook already registered — skipped');
} else {
  settings.hooks.Stop.push({
    matcher: '',
    hooks: [{ type: 'command', command: 'bash ~/.claude/skills/water/hook.sh' }],
  });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('  ✓ Stop hook registered in settings.json');
}
NODE

echo ""
echo "Done. A new entry is logged per completed turn to:"
echo "  ${CLAUDE_DIR}/water-log.jsonl"
echo ""
echo "View stats in the terminal:"
echo "  node ${SKILL_DIR}/lib/show.mjs"
echo ""
echo "Open the dashboard:"
echo "  open ${SCRIPT_DIR}/index.html   # then drag your water-log.jsonl onto it"
