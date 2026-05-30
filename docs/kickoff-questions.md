# Water Tracker — Build Kickoff Questions for Claude

A checklist of questions and design considerations to surface at the start of a Claude Code build session, so the unknowns come out before they become rework.

**Project context:** A hybrid `/water` skill + static dashboard that tracks the water footprint of Claude usage based on Li et al.'s research. The skill captures token counts via a Claude Code hook and appends to `~/.claude/water-log.jsonl`. A separate static HTML dashboard reads the dropped file and renders charts. No API keys, no network, no server.

---

## Load-bearing questions (ask first, before any code)

1. **Which Claude Code hook event delivers token usage?** Show me the exact payload schema for `PostToolUse`, `Stop`, and any session-end hook. I need fields for `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, and `model`. If none of them include usage, what's the fallback — transcript parsing from `~/.claude/projects/...`?
2. **Does the hook fire once per turn, once per tool call, or once per session?** I need to know so I don't double-count or miss turns.
3. **What's the canonical path for the transcript/session file on disk?** I want a backup capture path in case hooks change.

## Formula & methodology

4. **Which Li et al. numbers are we using exactly — the 2023 paper or the 2025 update?** Cite the figure and table. I want page references in `methodology.md`.
5. **What WUE range should I publish — single datacenter, US average, or a min/max band?** I'd rather show a range than a fake-precise number.
6. **How should I weight cache reads vs. fresh input tokens vs. output tokens?** Output tokens cost more compute than input — what multiplier?
7. **Do we have published per-model compute differences for Opus / Sonnet / Haiku, or do I need to estimate from pricing as a proxy?** Flag the uncertainty either way.
8. **On-site water (cooling) vs off-site water (electricity generation) — am I reporting one, the other, or both as separate figures?**

## Schema & storage

9. **JSONL schema review — what fields am I missing?** Walk through my draft entry and flag anything I'll regret not capturing.
10. **Schema versioning strategy — `"v": 1` field plus a migration function, or something else?**
11. **One lifetime log at `~/.claude/water-log.jsonl`, or per-project logs that get aggregated?** Pros/cons.
12. **What's the right behavior if the log file is corrupted or partially written?** I want crash-safe append.

## Skill mechanics

13. **Show me a minimal `hooks.json` that registers a hook script and survives Claude Code updates.**
14. **Should the skill be a slash command, a hook, or both?** I think both — hook for capture, `/water` for display — confirm that's the right split.
15. **How do I test a hook locally without burning real tokens?** Mock payloads?
16. **What happens if two Claude Code sessions write to the log file at once?** Do I need file locking?

## Dashboard mechanics

17. **Pure static site with drag-and-drop JSONL, or a tiny local server that auto-reads the file?** I want zero-install if possible.
18. **What chart library plays nicest with a static drop-in HTML file?** Lightweight, no build step preferred.
19. **How do I share formula constants between the Python skill and the JS dashboard without them drifting?** One JSON file read by both?

## Privacy & sharing

20. **Confirm: the log contains zero prompt content, zero response content, only numbers + timestamps + model names. Audit my schema for anything that could leak.**
21. **For the "share my stats" feature — what's the minimum safe export?** Aggregate counts only, or is per-session data OK?
22. **If I publish the dashboard as a static site, what's the threat model if someone forks it and adds a tracker?** Does the README need a warning?

## Scope discipline (just as important)

23. **What am I tempted to build that I should explicitly cut from v1?** Push back on me if I scope-creep. My v1 is: capture tokens → log → show daily/lifetime totals + one comparison metric. That's it.
24. **What's the smallest thing I could ship in a single evening that would still be honest and useful?**

## Validation

25. **How do I sanity-check my water numbers against the paper's published examples?** I want at least one known input → known output test case.
26. **What's a reasonable accuracy claim for the README?** "±30%" or whatever the methodology supports — I don't want to overclaim.

---

## Meta question to ask at the start

> "Before we write any code, walk me through everything you're uncertain about in this plan. I'd rather hear 'I don't know if that hook payload includes token counts' now than discover it after I've written 200 lines."

That last one is the highest-leverage prompt of the lot — it forces the unknowns out before they become rework.

---

## Proposed structure (for reference)

```
~/.claude/
  skills/
    water/
      SKILL.md              # /water command: show today/session/lifetime
      hook.sh               # invoked by PostToolUse or Stop hook
      lib/
        formula.py          # water calc, per-model constants, ranges
        log.py              # append + read JSONL
      methodology.md        # the honest "how we calculate" page
  water-log.jsonl           # the lifetime log
  hooks.json                # registers hook.sh to the right event

water-dashboard/            # separate repo / static site
  index.html
  app.js                    # parses dropped JSONL, renders charts
  formula.js                # SAME constants as Python version
  methodology.html          # mirrors the skill's methodology.md
```

**Draft log entry shape:**

```json
{"v":1,"ts":"2026-05-28T10:59:00Z","session":"abc123","model":"claude-sonnet-4-5","in":1240,"out":380,"cache_r":8200,"cache_w":0,"project":"career-ops"}
```

**The one rule that keeps the two components honest:** the formula constants live in *one source of truth* (a JSON file, ideally) that both the Python skill and the JS dashboard read. If they ever drift, your numbers contradict each other and credibility evaporates.

---

## Sequencing

1. Confirm the hook situation — 20 min spike.
2. Pin down the formula: which models, which WUE assumptions, what range to display. Write `methodology.md` *first*, before code. This forces honesty.
3. Build the skill end-to-end (hook → log → `/water` reading the log). Live with it for a week.
4. Build the dashboard against the real log you've accumulated. Dogfooded data beats synthetic data.
5. Ship.
