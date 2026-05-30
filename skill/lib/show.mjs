#!/usr/bin/env node
/**
 * Usage:
 *   node show.mjs                 — session / today / week / lifetime
 *   node show.mjs --validate      — runs formula self-test
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { calculateWater, validate as validateFormula, checkPricing } from './formula.mjs';

const HOME     = homedir();   // cross-platform: $HOME on Unix, %USERPROFILE% on Windows
const LOG_PATH = `${HOME}/.claude/water-log.jsonl`;

const args = process.argv.slice(2);

if (args.includes('--validate')) {
  const r = validateFormula();
  console.log(`✓ Validation passed — expected ${r.expected}mL, got ${r.got}mL (${r.deviation_pct}% deviation)`);

  // Pricing structure checks (errors fail, staleness only warns)
  const { errors, warnings } = checkPricing();
  for (const w of warnings) console.log(`⚠ ${w}`);
  for (const e of errors)   console.log(`✗ ${e}`);
  if (errors.length) {
    console.log(`\nPricing structure check failed (${errors.length} error${errors.length > 1 ? 's' : ''}) — fix formula.json.`);
    process.exit(1);
  }
  console.log(`✓ Pricing structure OK${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''} above)` : ''}`);
  process.exit(0);
}

// --- read log ---
function readLog() {
  if (!existsSync(LOG_PATH)) return [];
  return readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Water is derived on read — not stored in log entries (Cursor audit fix #2)
function sumEntries(entries) {
  return entries.reduce((a, e) => {
    const w = calculateWater({ in: e.in, out: e.out, cache_r: e.cache_r, cache_w: e.cache_w }, e.model);
    return { lo: a.lo + w.lo, mid: a.mid + w.mid, hi: a.hi + w.hi, turns: a.turns + 1 };
  }, { lo: 0, mid: 0, hi: 0, turns: 0 });
}

// --- formatting ---
function fmtMl(mL) {
  if (mL === 0)  return '0 mL';
  if (mL < 1)    return `${(mL * 1000).toFixed(0)} µL`;
  if (mL < 1000) return `${mL.toFixed(1)} mL`;
  return `${(mL / 1000).toFixed(2)} L`;
}

function comparison(mL) {
  if (mL <= 0)   return '—';
  if (mL < 5)    return 'less than a teaspoon';
  if (mL < 15)   return `≈ ${(mL / 5).toFixed(1)} tsp`;
  if (mL < 250)  return `≈ ${Math.round(mL / 237 * 100)}% of a cup`;
  if (mL < 600)  return `≈ ${Math.round(mL / 500 * 100)}% of a 500 mL bottle`;
  if (mL < 5000) return `≈ ${(mL / 500).toFixed(1)} water bottles`;
  return `≈ ${(mL / 1000).toFixed(1)} L total`;
}

function bar(mid, max, width = 16) {
  const f = Math.max(0, Math.min(Math.round((mid / max) * width), width));
  return '█'.repeat(f) + '░'.repeat(width - f);
}

// --- ANSI ---
const R  = '\x1b[0m';
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const CY = '\x1b[36m';
const BL = '\x1b[34m';
const YL = '\x1b[33m';
const MG = '\x1b[35m';
const RD = '\x1b[31m';

const all = readLog();

if (all.length === 0) {
  console.log(`\n${B}💧 Claude Water Footprint${R}\n`);
  console.log(`   No data yet. The hook logs one entry per completed turn.`);
  console.log(`   Verify the hook is registered in ~/.claude/settings.json\n`);
  process.exit(0);
}

// Timezone: use local date for "today" and "this week" (Cursor audit fix #9)
const now        = new Date();
const todayLocal = now.toLocaleDateString('en-CA');           // YYYY-MM-DD local

// Build a set of the last 7 local calendar dates — mirrors dashboard's lastNDays(7)
const week7Set = new Set();
for (let i = 0; i < 7; i++) week7Set.add(new Date(now - i * 86400000).toLocaleDateString('en-CA'));

function isToday(ts) {
  return new Date(ts).toLocaleDateString('en-CA') === todayLocal;
}
function isThisWeek(ts) {
  return week7Set.has(new Date(ts).toLocaleDateString('en-CA'));
}

const latestSession   = all[all.length - 1].session;
const sessionEntries  = all.filter(e => e.session === latestSession);
const todayEntries    = all.filter(e => isToday(e.ts));
const weekEntries     = all.filter(e => isThisWeek(e.ts));

const sT = sumEntries(sessionEntries);
const dT = sumEntries(todayEntries);
const wT = sumEntries(weekEntries);
const lT = sumEntries(all);

const maxMid = Math.max(sT.mid, dT.mid, wT.mid, lT.mid, 1);

function row(label, color, totals) {
  const v    = fmtMl(totals.mid).padStart(9);
  const rng  = `${fmtMl(totals.lo)}–${fmtMl(totals.hi)}`;
  const cmp  = comparison(totals.mid);
  const trns = `${totals.turns} turn${totals.turns !== 1 ? 's' : ''}`;
  console.log(`   ${color}${label.padEnd(15)}${R} ${D}${bar(totals.mid, maxMid)}${R} ${B}${v}${R}  ${D}${rng}  ${cmp}  ${trns}${R}`);
}

console.log('');
console.log(`${B}💧 Claude Water Footprint${R}  ${D}(Li et al. 2023 · ±50% accuracy)${R}`);
console.log('');
row('This session',  CY, sT);
row('Today',         BL, dT);
row('This week',     YL, wT);
row('Lifetime',      MG, lT);
console.log('');

// Stale data warning — no shell/execSync; use readdirSync + statSync instead
try {
  const latestLogMs = new Date(all[all.length - 1].ts).getTime();
  if ((Date.now() - latestLogMs) > 24 * 3600000) {
    const projectsRoot = `${HOME}/.claude/projects`;
    let recentCount = 0;
    for (const dir of readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      try {
        for (const f of readdirSync(`${projectsRoot}/${dir.name}`, { withFileTypes: true })) {
          if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
          const mtime = statSync(`${projectsRoot}/${dir.name}/${f.name}`).mtimeMs;
          if (mtime > latestLogMs) recentCount++;
        }
      } catch {}
    }
    if (recentCount > 0) {
      console.log(`   ${RD}⚠ ${recentCount} session(s) since last log entry — is the Stop hook still registered?${R}`);
      console.log(`   ${D}Check: cat ~/.claude/settings.json | grep -A8 hooks${R}`);
      console.log('');
    }
  }
} catch {}

console.log(`   ${D}${all.length} turns logged · ${LOG_PATH}${R}`);
console.log(`   ${D}methodology: ~/.claude/skills/water/methodology.md${R}`);
console.log('');
