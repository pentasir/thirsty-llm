#!/usr/bin/env node
/**
 * Called by hook.sh via stdin:
 *   echo "$STOP_PAYLOAD" | node log.mjs
 *
 * Reads the Stop hook payload, finds unprocessed assistant entries in the
 * transcript since the last cursor position, and appends one JSONL line of
 * RAW TOKEN COUNTS per model used in the turn (usually one) to
 * ~/.claude/water-log.jsonl. A turn can span multiple models — e.g. Haiku
 * subagents inside a Sonnet turn — and lumping them under one model would
 * skew the per-model view and the pricing-derived multiplier.
 *
 * Water values are NOT pre-computed — derived at display-time so formula
 * updates retroactively apply to all historical entries.
 *
 * Failures are written to ~/.claude/water-log.err.jsonl as structured JSON.
 * This file must never crash or block Claude Code — hard 5s timeout enforced.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
// No child_process — removed in patch-5 to eliminate shell-interpolation pattern.

const HOME      = homedir();   // cross-platform: $HOME on Unix, %USERPROFILE% on Windows
const LOG_PATH  = `${HOME}/.claude/water-log.jsonl`;
const CUR_PATH  = `${HOME}/.claude/water-cursor.json`;
const ERR_PATH  = `${HOME}/.claude/water-log.err.jsonl`;
const FORMULA_PATH = `${HOME}/.claude/formula.json`;

// Hard cap: never block Claude Code's Stop hook for more than 5 seconds.
// .unref() so the timer doesn't keep the process alive if work completes quickly.
setTimeout(() => process.exit(0), 5000).unref();

function ensureMode(path) {
  try { if (existsSync(path)) chmodSync(path, 0o600); } catch {}
}

function logError(err) {
  try {
    appendFileSync(
      ERR_PATH,
      JSON.stringify({ ts: new Date().toISOString(), err: String(err), stack: err?.stack ?? null }) + '\n',
      { mode: 0o600 }
    );
  } catch {}
}

function formulaVersion() {
  try { return JSON.parse(readFileSync(FORMULA_PATH, 'utf8')).version ?? '?'; }
  catch { return '?'; }
}

// --- stdin ---
let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => { run(raw).catch(logError); });

async function run(payload) {
  let data;
  try { data = JSON.parse(payload); }
  catch (e) { logError(`JSON parse failed: ${e?.message}`); return; }

  const sessionId  = data.session_id ?? data.sessionId ?? '';
  const cwd        = data.cwd ?? '';
  const entrypoint = data.entrypoint ?? 'cli';

  if (!sessionId) { logError('No session_id in payload'); return; }

  const transcriptPath = resolveTranscript(data, sessionId, cwd);
  if (!transcriptPath) { logError(`Could not resolve transcript for session ${sessionId}`); return; }
  if (!existsSync(transcriptPath)) { logError(`Transcript not found: ${transcriptPath}`); return; }

  let lines;
  try { lines = readFileSync(transcriptPath, 'utf8').split('\n'); }
  catch (e) { logError(`Could not read transcript: ${e?.message}`); return; }

  // --- cursor: last processed uuid per session ---
  const cursor  = existsSync(CUR_PATH) ? safeJson(readFileSync(CUR_PATH, 'utf8'), {}) : {};
  const lastUuid = cursor[sessionId] ?? null;

  // --- collect new assistant entries since cursor ---
  let foundCursor = !lastUuid;
  const newEntries = [];
  let latestUuid = lastUuid;

  for (const line of lines) {
    const entry = safeJson(line.trim(), null);
    if (!entry || entry.type !== 'assistant' || !entry.message?.usage) continue;

    if (!foundCursor) {
      if (entry.uuid === lastUuid) foundCursor = true;
      continue;
    }
    newEntries.push(entry);
    latestUuid = entry.uuid;
  }

  if (newEntries.length === 0 || !latestUuid || latestUuid === lastUuid) return;

  // --- aggregate raw token counts per model (no water pre-computation) ---
  const perModel = new Map();
  for (const e of newEntries) {
    const u = e.message.usage;
    const m = e.message.model ?? 'claude-sonnet-4-6';
    const acc = perModel.get(m) ?? { in: 0, out: 0, cache_r: 0, cache_w: 0 };
    acc.in      += u.input_tokens                ?? 0;
    acc.out     += u.output_tokens               ?? 0;
    acc.cache_r += u.cache_read_input_tokens     ?? 0;
    acc.cache_w += u.cache_creation_input_tokens ?? 0;
    perModel.set(m, acc);
  }

  const last    = newEntries[newEntries.length - 1];
  const project = cwd.split(/[\\/]/).pop() ?? '';   // handle both / (Unix) and \ (Windows) separators
  // geo: empty string currently; preserved for future per-region WUE narrowing
  const geo     = last.message.usage?.inference_geo || null;

  const ts        = new Date().toISOString();
  const formula_v = formulaVersion();
  const logLines = [...perModel.entries()].map(([model, usage]) =>
    JSON.stringify({
      v:         1,
      formula_v,
      ts,
      session:   sessionId,
      model,
      in:        usage.in,
      out:       usage.out,
      cache_r:   usage.cache_r,
      cache_w:   usage.cache_w,
      project,
      entrypoint,
      geo,
    }) + '\n'
  );

  try {
    appendFileSync(LOG_PATH, logLines.join(''), { mode: 0o600 });
    ensureMode(LOG_PATH); // post-write chmod covers new-file creation (mode option only applies on create, not on existing files with wrong perms)
  } catch (e) { logError(`Could not write log: ${e?.message}`); return; }

  // --- update cursor: delete-then-set to refresh insertion order ---
  // Without this, a long-lived session stays at its original insertion position
  // and can be evicted by the 200-key cap even if it's the most active session.
  delete cursor[sessionId];
  cursor[sessionId] = latestUuid;
  const keys = Object.keys(cursor);
  const trimmed = keys.length > 200
    ? Object.fromEntries(keys.slice(-200).map(k => [k, cursor[k]]))
    : cursor;
  try {
    writeFileSync(CUR_PATH, JSON.stringify(trimmed), { mode: 0o600 });
    ensureMode(CUR_PATH);
  } catch (e) { logError(`Could not write cursor: ${e?.message}`); }
}

function resolveTranscript(data, sessionId, cwd) {
  const root = `${HOME}/.claude/projects`;

  // Prefer explicit path — validate it's under projects/ to prevent arbitrary reads
  if (data.transcript_path) {
    const p = data.transcript_path;
    if (p.startsWith(root + '/') && existsSync(p)) return p;
  }

  // Derive from cwd: /Users/jdon/career-ops → -Users-jdon-career-ops
  if (cwd) {
    const candidate = `${root}/${cwd.replace(/\//g, '-')}/${sessionId}.jsonl`;
    if (existsSync(candidate)) return candidate;
  }

  // Last resort: scan projects dir — no shell, no interpolation
  try {
    for (const dirent of readdirSync(root, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const candidate = `${root}/${dirent.name}/${sessionId}.jsonl`;
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  return null;
}

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
