# How ThirstyLLM was built

**ThirstyLLM** estimates how much water your Claude usage consumes, based on [Li et al. 2023](https://arxiv.org/abs/2304.03271) (*"Making AI Less 'Thirsty'"*). This page is the honest build story & not a marketing page.

---

## Why this exists

Every LLM prompt runs on hardware in a data centre that needs cooling water. Li et al. showed that a simple ChatGPT conversation can consume on the order of a **500 mL bottle** of water in the US but no one shipped a tool that hooks that research into *your* actual usage. I was also personally curious about my water usage -- there is a tool to measure LLM energy usage but none for water usage. 

ThirstyLLM closes that gap for Claude Code users: capture token counts locally, estimate water with a published methodology, show results in a browser  **without an API key and without sending your data anywhere.**

---

## Design principles (non-negotiable)

These constraints shaped every decision:

| Principle | What it means in practice |
|---|---|
| **No API key** | Token counts come from Claude Code transcripts on disk, not from Anthropic's API |
| **No network** | Dashboard CSP is `default-src 'none'` — the browser cannot make outbound requests, even if compromised |
| **No storage** | No cookies, localStorage, or analytics. Close the tab, data is gone |
| **Works offline** | Double-click `index.html`, drop your log, disconnect wifi — still works |
| **Honest ranges** | Every water figure is low / mid / high — never a single fake-precise number |
| **Log is numbers only** | No prompts, no responses, no file contents — only tokens, timestamps, model, project name |

The privacy claim is structural, not just a policy: you can verify it yourself in DevTools → Network after dropping your log.

---

## Architecture

```
Claude Code (Stop hook)
        │  reads session transcript on disk
        ▼
skill/ → ~/.claude/water-log.jsonl   (raw token counts + formula_v)
        │  drag & drop — never uploaded
        ▼
index.html  →  derives water from formula.json, renders locally
```

**Single source of truth:** `formula.json` holds all constants. The skill reads it at display time; the dashboard inlines a copy so it can run as one offline file.

**Timezone:** Log timestamps are stored in UTC. The dashboard converts to the viewer's local date for "today" and "this week" so "today" means your today, not UTC midnight.

---

## The hardest calibration problem: cache reads

Not all tokens cost the same compute. Output tokens drive most of the work; cache reads (reusing prior context) are much cheaper but not free.

Early versions weighted cache reads too high. In long Claude Code sessions with millions of cache-read tokens, estimates ballooned to **litres per turn**, which contradicted Li et al.'s whole-bottle-per-conversation anchor.

The fix: a deliberate **floor weight** (0.001×) below what raw pricing would suggest, with the deviation documented and absorbed into the ±50% accuracy band. A future formula version should model attention as `cache_size × output_tokens` that needs data Anthropic doesn't publish.

---

## Model pricing: verify against the live page

Multipliers are derived from Anthropic's published output-token pricing (verified [2026-05-30](https://www.anthropic.com/pricing)), not hardcoded:

| Model | Output price | Multiplier (vs Sonnet baseline) |
|---|---:|---:|
| Haiku 4.5 | $5/MTok | 0.33× |
| Sonnet 4.5 / 4.6 | $15/MTok | 1.00× (baseline) |
| Opus 4.5–4.8 | $25/MTok | 1.67× |

Pricing includes margin. Treat multipliers as ±factor-of-2. Re-check the live pricing page when Anthropic updates rates.

---

## How it was built (process, briefly)

Built in a week with a deliberate split:

- **Claude Sonnet** — implementation, dashboard UI, hook integration
- **Claude Opus** — design review, security audit, pricing verification
- **Cursor** — cross-model review caught calibration drift, schema mistakes, and silent failure modes before they shipped

Key lesson from the audit loop: **"pricing-derived" numbers must be re-checked against the live pricing page every release** — carrying forward stale multipliers caused a 6× Haiku overcount until we verified against anthropic.com/pricing.

The full session-by-session case study (patches, tables, audit trail) is available on request — this page is the public summary.

---

## What "9 turns" means

One **turn** = one completed exchange: you send a message, Claude finishes responding, the Stop hook logs it. One line in `water-log.jsonl`. Not one tool call, not one message — the whole cycle, however large.

Token and water totals vary wildly per turn. The dashboard shows both so you can see *how much* each exchange cost, not just how many.

---

## Accuracy claim (for the README)

> Estimates are accurate to within ±50% of empirically measured values, based on Li et al. 2023. The model is directionally correct — more tokens always means more water. Absolute values depend on which data centre handled your request, which Anthropic does not publicly disclose.

---

*Built by Jason K. Don · May 2026 · Independent project; not affiliated with Anthropic. "Claude" is a trademark of Anthropic.*
