# /water — Claude Water Footprint

Track and display the water footprint of your Claude sessions, anchored to ML.ENERGY Leaderboard v3.0 measurements (methodology framework: Li et al. 2023).

## When to invoke

The user types `/water` or asks about their water usage / AI water footprint.

## What to do

Run the show script and display its output verbatim:

```bash
node ~/.claude/skills/water/lib/show.mjs
```

The script outputs a formatted table with session / today / week / lifetime totals
plus a low–mid–high range for each period. Display it as-is — it's already
formatted for terminal output.

## Subcommands

**`/water validate`** — run the formula self-test:
```bash
node ~/.claude/skills/water/lib/show.mjs --validate
```
Checks two things: (1) the arithmetic anchor (36,000 output tokens ≈ 13 mL
under the v1.3 ML.ENERGY formula), and (2) the pricing
structure — a missing/zero baseline, a non-numeric price, or a multiplier
outside 0.01–10× (typo guard) fail with exit 1. It also *warns* if pricing
was last verified over 120 days ago. Note: it cannot tell whether prices are
*current* — that's a manual check against anthropic.com/pricing.

**`/water methodology`** — explain how the calculation works:
```bash
cat ~/.claude/skills/water/methodology.md
```
Then summarise the key points: ML.ENERGY anchor, token weights, ±50% accuracy claim.

**`/water export`** — show the raw log:
```bash
cat ~/.claude/water-log.jsonl
```
Tell the user they can drag this file into the dashboard for visualisations —
`index.html` in the repo, or the hosted copy at https://pentasir.github.io/thirsty-llm/.

**`/water reset`** — the user wants to clear their log. Ask for confirmation first.
If confirmed: `mv ~/.claude/water-log.jsonl ~/.claude/water-log.jsonl.bak`
Tell them the original is backed up.

## If there's no log yet

Explain that the Stop hook logs one entry per turn automatically. Check the hook
is registered:

```bash
cat ~/.claude/settings.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('hooks',{}), indent=2))"
```

If the `Stop` hook is missing, tell the user to check `~/.claude/settings.json`
and that the hook entry should point to `~/.claude/skills/water/hook.sh`.

## Context

- Log file: `~/.claude/water-log.jsonl`
- Formula constants: `~/.claude/formula.json`
- Methodology: `~/.claude/skills/water/methodology.md`
- Accuracy: ±50% — always report the range, never a single figure
- Sources: ML.ENERGY Leaderboard v3.0 (Chung et al., NeurIPS 2025); Li et al. 2023, arXiv:2304.03271 (methodology framework)
