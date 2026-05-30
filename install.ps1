<#
.SYNOPSIS
  thirstyLLM installer for Windows (native — no WSL/Git Bash required).

.DESCRIPTION
  Deploys the water-tracking skill into %USERPROFILE%\.claude and registers the
  Stop hook. Re-runnable (idempotent). Requires Node.js on PATH.

  Unlike the macOS/Linux install.sh (which registers a Bash hook), this registers
  the hook as a direct `node` command pointing at lib/log.mjs, so no shell is
  involved. Run from PowerShell:

      powershell -ExecutionPolicy Bypass -File .\install.ps1
#>

$ErrorActionPreference = 'Stop'

$ClaudeDir = Join-Path $env:USERPROFILE '.claude'
$SkillDir  = Join-Path $ClaudeDir 'skills\water'
$ScriptDir = $PSScriptRoot

Write-Host "thirstyLLM installer (Windows)"
Write-Host "  Source: $ScriptDir"
Write-Host "  Target: $SkillDir"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "node not found on PATH. Install Node.js first, then re-run."
  exit 1
}

# 1. Copy skill files
New-Item -ItemType Directory -Force -Path (Join-Path $SkillDir 'lib') | Out-Null
Copy-Item (Join-Path $ScriptDir 'skill\SKILL.md')       $SkillDir -Force
Copy-Item (Join-Path $ScriptDir 'skill\methodology.md') $SkillDir -Force
Copy-Item (Join-Path $ScriptDir 'skill\hook.sh')        $SkillDir -Force   # for reference; not used on Windows
Copy-Item (Join-Path $ScriptDir 'skill\lib\*.mjs')      (Join-Path $SkillDir 'lib') -Force
Write-Host "  [ok] Skill files copied"

# 2. Copy formula.json (single source of truth) to ~/.claude
Copy-Item (Join-Path $ScriptDir 'formula.json') (Join-Path $ClaudeDir 'formula.json') -Force
Write-Host "  [ok] formula.json installed"

# 3. Register the Stop hook in settings.json (idempotent, preserves existing settings)
$SettingsPath = Join-Path $ClaudeDir 'settings.json'
$LogScript    = Join-Path $SkillDir 'lib\log.mjs'
$HookCommand  = "node `"$LogScript`""

if (Test-Path $SettingsPath) {
  $settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [PSCustomObject]@{}
}

# Ensure hooks.Stop exists as an array (missing properties read back as $null)
if ($null -eq $settings.hooks) {
  $settings | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) -Force
}
if ($null -eq $settings.hooks.Stop) {
  $settings.hooks | Add-Member -NotePropertyName Stop -NotePropertyValue @() -Force
}

# Already registered? (match log.mjs path, tolerant of slash direction)
$already = ($settings.hooks.Stop | ConvertTo-Json -Depth 10) -match 'water[\\/]+lib[\\/]+log\.mjs'
if ($already) {
  Write-Host "  [skip] Stop hook already registered"
} else {
  $entry = [PSCustomObject]@{
    matcher = ''
    hooks   = @([PSCustomObject]@{ type = 'command'; command = $HookCommand })
  }
  $settings.hooks.Stop = @($settings.hooks.Stop) + $entry
  ($settings | ConvertTo-Json -Depth 10) | Set-Content $SettingsPath -Encoding utf8
  Write-Host "  [ok] Stop hook registered in settings.json"
}

Write-Host ""
Write-Host "Done. A new entry is logged per completed turn to:"
Write-Host "  $(Join-Path $ClaudeDir 'water-log.jsonl')"
Write-Host ""
Write-Host "View stats in the terminal:"
Write-Host "  node `"$(Join-Path $SkillDir 'lib\show.mjs')`""
Write-Host ""
Write-Host "Open the dashboard:"
Write-Host "  start `"$(Join-Path $ScriptDir 'index.html')`"   # then drag your water-log.jsonl onto it"
