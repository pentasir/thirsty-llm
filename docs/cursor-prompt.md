# Prompt for Claude — Water Dashboard V1 Constraints

Paste the block below into the Claude Code session that's building the foundation. It's written as a directive/constraint pack that slots into ongoing work, not a from-scratch brief.

---

Architectural decision for the **dashboard component** of V1. Apply these constraints to the foundation you're building. If any conflict with what you've already written, flag it before changing course.

**Mode:** Single-file static HTML dashboard. User drags a `.jsonl` file from their filesystem onto the page; we parse and render entirely client-side. **No** File System Access API, **no** IndexedDB, **no** persistence between sessions. Stateless by design — for auditability, cross-browser support, and a defensible privacy claim.

## Hard constraints (do not violate without flagging first)

1. **Single file.** Ship as one `index.html` with inlined JS and CSS. No build step. A user should be able to `curl` the file and double-click it.
2. **No CDN dependencies.** Inline (vendor) any libraries directly into the HTML. If a CDN is genuinely unavoidable, pin with SRI hashes and justify it.
3. **Strict CSP via `<meta http-equiv="Content-Security-Policy">`:**
   ```
   default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'
   ```
   `connect-src 'none'` is the load-bearing rule — it makes network exfiltration structurally impossible even if the JS is later compromised.
4. **Works at `file://`.** Opening `index.html` by double-click from Finder must give full functionality with zero network. Test by disabling wifi.
5. **No `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or service workers.** Memory-only. Closing the tab wipes everything.
6. **Zero analytics, zero telemetry, zero error reporting endpoints.**

## Functional scope for V1 (resist scope creep — push back if I ask for more)

- Drop zone for `.jsonl` files, with `<input type="file">` as fallback
- Parse JSONL line-by-line; skip malformed lines gracefully and surface a count of skipped lines
- Render:
  - Today's tokens + estimated water as a **range** (e.g., "0.4–1.2 L")
  - Last 7 days line chart
  - Lifetime totals
  - Per-model breakdown (Opus / Sonnet / Haiku)
  - One human-readable comparison ("≈ 3 cups of water")
- Inline methodology section (collapsible or modal) citing the paper and page

## Out of scope for V1 — explicitly defer

- Live re-read / File System Access API (this becomes V2)
- Export, share, social cards
- Filters, date pickers, project breakdowns
- Settings, themes, dark mode toggle (pick one good default)

## Log schema you're consuming

```json
{"v":1,"ts":"2026-05-28T10:59:00Z","session":"abc123","model":"claude-sonnet-4-5","in":1240,"out":380,"cache_r":8200,"cache_w":0,"project":"career-ops"}
```

## Formula constants

Inline a single `WATER_FORMULA` object at the top of the JS with per-model coefficients, WUE range, and citation comments (paper, figure/table, page). The Python skill must read the same numbers from a shared `formula.json` — they cannot drift. Always render water as a **range**, never a single point estimate.

## Acceptance checks — run these before declaring V1 done

1. Open DevTools → Network → drop the file → confirm **zero** network requests.
2. Disable wifi → double-click `index.html` → confirm full functionality.
3. `grep -iE "localStorage|sessionStorage|indexedDB|cookie|fetch\(|XMLHttpRequest|navigator\.sendBeacon" index.html` → zero matches.
4. Drop a deliberately malformed JSONL (truncated last line, garbage line in the middle) → confirm graceful handling, not a crash.
5. View source → confirm no external URLs in `src`/`href` other than relative paths.

## Before you write or change code, answer

- Which chart library are you inlining and why? (Chart.js is ~200KB; a hand-rolled canvas/SVG renderer may be lighter and easier to audit. Make the call and justify it.)
- Where do `WATER_FORMULA` constants live, and how do we keep them in sync with the Python skill?
- Anything in these constraints you'd push back on?
