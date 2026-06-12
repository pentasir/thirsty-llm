# How ThirstyLLM was built

**ThirstyLLM** estimates how much water your Claude usage consumes — anchored to [ML.ENERGY Leaderboard](https://ml.energy/leaderboard/) measurements, within the water-footprint framework of [Li et al. 2023](https://arxiv.org/abs/2304.03271) (*"Making AI Less 'Thirsty'"*). This page is the honest build story & not a marketing page.

---

## Why this exists

Every LLM prompt runs on hardware in a data centre that needs cooling water. Li et al. showed that a simple ChatGPT conversation can consume on the order of a **500 mL bottle** of water in the US (a GPT-3-era estimate the same authors later advised against applying to modern models — see *The 39× correction* below), but no one shipped a tool that hooks that research into *your* actual usage. I was also personally curious about my water usage -- there is a tool to measure LLM energy usage but none for water usage. 

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

## The 39× correction

v1.2 anchored the water rate to Li et al.'s 2023 empirical figure: 0.014 mL per token, measured in the GPT-3 era. To validate it, I emailed the paper's lead author, Shaolei Ren. His reply (2026-05-31): the 2023 estimates should not be applied directly to modern models — inference efficiency has improved dramatically — and he pointed to the ML.ENERGY Leaderboard as the better energy source.

v1.3 re-anchored to ML.ENERGY's measured 0.39 J/output token (Llama 3.1 70B FP8 on H100), giving 0.00036 mL/token — **39× lower than the figure this project launched with**. The revision was published openly, with the correspondence quoted in [methodology.md](../skill/methodology.md), even though the smaller number makes for a less dramatic headline. A water-tracking tool that won't revise its own estimates downward isn't a measurement tool; it's marketing.

---

## Model pricing: verify against the live page

Multipliers are derived from Anthropic's published output-token pricing (verified [2026-06-12](https://platform.claude.com/docs/en/about-claude/models/overview)), not hardcoded:

| Model | Output price | Multiplier (vs Sonnet baseline) |
|---|---:|---:|
| Haiku 4.5 | $5/MTok | 0.33× |
| Sonnet 4.5 / 4.6 | $15/MTok | 1.00× (baseline) |
| Opus 4.5–4.8 | $25/MTok | 1.67× |
| Fable 5 / Mythos 5 | $50/MTok | 3.33× |

Pricing includes margin. Treat multipliers as ±factor-of-2. Re-check Anthropic's live models documentation when rates change — models missing from the table fall back to the Sonnet baseline, and both the terminal view and dashboard now warn when that happens.

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

One **turn** = one completed exchange: you send a message, Claude finishes responding, the Stop hook logs it. One line in `water-log.jsonl` per model used in the turn — usually one; turns that delegate to subagents on other models produce a line per model so each is priced correctly. Not one tool call, not one message — the whole cycle, however large.

Token and water totals vary wildly per turn. The dashboard shows both so you can see *how much* each exchange cost, not just how many.

---

## Accuracy claim (for the README)

> Estimates are anchored to ML.ENERGY Leaderboard v3.0 (Dec 2025) measured values, applied to Claude via a model-size proxy. The model is directionally correct — more tokens always means more water. The prior Li et al. 2023 anchor (GPT-3 era) overestimated by ~39× on modern hardware; v1.3 corrects for that. Residual uncertainty is ±50% or more; absolute values depend on which data centre handled your request, which Anthropic does not publicly disclose.

---

*Built by Jason K. Don · May 2026 · Independent project; not affiliated with Anthropic. "Claude" is a trademark of Anthropic.*
