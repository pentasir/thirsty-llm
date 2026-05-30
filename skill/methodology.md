# Water Footprint Methodology

**Version:** 1.2
**Source:** Li et al. 2023, arXiv:2304.03271
**Accuracy:** ±50% vs empirically measured values

---

## What We Measure

We estimate **water consumption** — water that evaporates during data centre cooling and is not returned to its source. This is distinct from *water withdrawal* (total water taken from source, most of which is returned).

We report on-site water only (cooling). Off-site water (used to generate the electricity that powers the data centre) is estimated at 2–3× on-site but is harder to attribute and varies by regional electricity grid.

---

## The Calculation Chain

### Step 1 — Effective Token Count

Not all tokens cost the same compute. Each token type is weighted before applying the water rate:

| Token type | Weight | Pricing-derived | Basis |
|---|---:|---:|---|
| Output | 1.00× | 1.00× (baseline) | Full autoregressive generation. Anchors the formula to Li et al.'s empirical figure. |
| Fresh input | 0.20× | 0.20× ($3/$15 MTok) | Parallelised prefill, single forward pass, cheaper than decode. |
| Cache creation | 0.25× | 0.25× ($3.75/$15 MTok) | Forward pass plus KV-state persistence. |
| Cache read | **0.001×** | ~0.02× ($0.30/$15 MTok) | **Deliberate empirical floor.** Pricing-derived value caused implausible totals in long-context Claude Code turns (one turn → 6.6 L). Floored downward; ±50% band absorbs the deviation. A future formula version should replace this with an explicit `cache_size × output_tokens` interaction term. |

```
effective_tokens =
    (output_tokens         × 1.00)
  + (fresh_input_tokens    × 0.20)
  + (cache_creation_tokens × 0.25)
  + (cache_read_tokens     × 0.001)
```

**About the pricing proxy:** API prices include margin, infrastructure cost, and R&D amortisation — they're not a direct measurement of compute. We use them because they're the only public number Anthropic discloses that correlates with compute, and the ±50% uncertainty band is sized to absorb this bias. Where we deviate from the pricing-derived value (cache_read), the deviation is documented explicitly above.

### Step 2 — Model Multiplier

Multipliers are derived from Anthropic's public output-token pricing at calculation time. Sonnet 4.6 is the 1.0× baseline. The implementation reads raw pricing from `formula.json` and divides by the baseline price, so updating to a new model is one line of pricing data.

| Model | Output price | Pricing-derived multiplier |
|---|---:|---:|
| Claude Haiku 4.5 | $5/MTok | 0.33× |
| Claude Sonnet 4.5 | $15/MTok | 1.00× |
| Claude Sonnet 4.6 | $15/MTok | 1.00× (baseline) |
| Claude Opus 4.5–4.8 | $25/MTok | 1.67× |

```
scaled_tokens = effective_tokens × model_multiplier
```

**Pricing verified:** 2026-05-30 against the live Anthropic pricing page (https://www.anthropic.com/pricing). If Anthropic updates pricing, update `formula.json` and bump the `_checked` field.

**Correction note (2026-05-30, patch 3):** All prices re-verified against the live page. Haiku 4.5 corrected $0.80→$5 (0.053×→0.33×); Sonnet 4.5 corrected $12→$15 (0.80×→1.00×, now matches baseline); Opus 4.5 $60→$25, Opus 4.7 $75→$25; Opus 4.6 and 4.8 added at $25. Sonnet 4.6 baseline unchanged — historical data unaffected.

**Caveats:**
- Pricing includes margin; multipliers should be treated as ±factor-of-2.
- We anchor the 1.0× baseline to Li et al.'s 0.014 mL/token figure, which was measured on GPT-3-class models. Sonnet 4.6's true per-token compute may differ; the directional accuracy (Haiku < Sonnet < Opus) is preserved by pricing ratios, but absolute magnitudes are what the ±50% band absorbs.
- **Prior versions of this tool had model multipliers drift from pricing** — Haiku coded at 0.3× (6× higher than pricing implies), Opus at 3.0× (40% lower than pricing implies). Patch 2 corrected this by storing raw pricing and deriving multipliers programmatically.

### Step 3 — Water Rate

We anchor to the Li et al. empirical figure and derive three scenarios:

```
water_mL = scaled_tokens × rate

Rate (mL per effective token):
  Low  = 0.0014   (AWS modern data centre, cool climate, WUE ≈ 0.18 L/kWh)
  Mid  = 0.014    (US average, WUE ≈ 1.8 L/kWh — Li et al. assumption)
  High = 0.031    (hot climate, older facility, WUE ≈ 4.0 L/kWh)
```

We always report all three. We never report a single number.

---

## Empirical Anchor

**Li et al. key figure (Section 4.2, Table 3):** *"ChatGPT needs to 'drink' a 500mL bottle of water for a simple conversation of roughly 20–50 questions and answers in the US."*

Working backwards:
```
500 mL ÷ 30 conversations (midpoint of 20–50) ÷ ~1,200 tokens/conversation
= 0.014 mL per token (central rate)
```

**Arithmetic check:**
```
36,000 tokens × 0.014 mL/token = 504 mL ≈ 500 mL ✓ (within 1%)
```

**What this validates and what it does not:**

This confirms the arithmetic is self-consistent. It does **not** independently validate the formula because the 0.014 constant was derived from the same 500 mL figure. Plugging it back in to recover ~500 mL is confirming arithmetic, not validating against independent data.

**Independent cross-check via energy chain:**

This approach derives water from first principles without using Li et al.'s empirical anchor:

```
Model size (claude-sonnet-4-6):      ~70B parameters (estimated)
FLOPs per output token:              2 × 70×10⁹ = 1.4×10¹¹ FLOPs
GPU (H100 SXM):                      ~1000 TFLOPS FP8 at 700W
Decode utilisation (memory-bound):   ~25%
Effective throughput per GPU:        250 TFLOPS

Energy per output token:
  = 1.4×10¹¹ FLOPs ÷ (250×10¹² FLOPs/s) × 700W
  = 5.6×10⁻⁴ Wh/token

With 4 GPUs (70B model requires tensor parallelism):
  × 4 = 2.24×10⁻³ Wh/token

With PUE 1.17 (AWS average):
  = 2.62×10⁻³ Wh/token = 2.62×10⁻⁶ kWh/token

Water at mid WUE (1.8 L/kWh):
  = 2.62×10⁻⁶ × 1.8 × 1000 mL/L = 0.0047 mL/token
```

**Result: 0.0047 mL/token vs 0.014 mL/token from Li et al. — a 3× discrepancy.**

This does not invalidate the empirical anchor. The energy-chain calculation carries large uncertainty in: model size (not disclosed), GPU count (not disclosed), actual GPU utilisation, cooling overhead, and whether water consumption vs withdrawal is counted. The 3× gap is within the combined uncertainty of both methods.

**Conclusion:** We use Li et al.'s empirical figure as the primary anchor. The energy-chain serves as a rough sanity check — not a second independent validation. Both methods are directionally consistent (same order of magnitude). Neither resolves to better than ±50%.

---

## What We Cannot Know

Anthropic does not publicly disclose:
- Which AWS regions or data centres handle inference
- Server utilisation rates (low utilisation = more water per token)
- Whether they use evaporative vs. air-side economiser cooling
- Per-model compute requirements

These unknowns drive the ±50% uncertainty band. The WUE variance alone spans a 20× range (0.18 to 4.0 L/kWh) across different facilities.

---

## What the Log Captures

Each turn appends one line to `~/.claude/water-log.jsonl`:

```jsonl
{"v":1,"formula_v":"1.2","ts":"2026-05-28T10:59:00Z","session":"abc123","model":"claude-sonnet-4-6","in":3,"out":153,"cache_r":12095,"cache_w":19036,"project":"career-ops","entrypoint":"cli","geo":null}
```

Water values are **not stored** in the log. They are derived on read from `formula.json`, so any formula update immediately propagates to all historical entries without migration.

**Privacy audit:** The log contains zero prompt content, zero response content, and no full filesystem paths. It does include the *name* of the project directory (the basename of `cwd`, e.g. `career-ops`) — this is a path component, not a full path. Users may omit the `project` field when sharing publicly. The `geo` field is null in all current entries; if Anthropic populates `inference_geo` in future, it will record a datacenter region identifier.

---

## Known Limitations

- **Model equivalence is assumed:** Li et al. measured GPT-3/3.5-era models. We treat claude-sonnet-4-6 as a rough peer at 1.0×. Unverified.
- **Token weights are partially cited:** The 5:1 output:input ratio is pricing-derived, not measured. Cache_read (0.001×) is a floor value to prevent long-context dominance — not independently measured. Both flagged for v1.2.
- **Model multipliers are point estimates:** Opus 3.0× likely represents a range of 2–5×. Using a point value understates total uncertainty.
- **Timezone handling:** Log entries are stored in UTC. "Today" and "this week" are computed in local time. Multi-day sessions that cross midnight may be split across days.
- **Log rotation:** After a year of heavy use the log may reach 50–100 MB. Parse time will grow. Future: archive old years to `water-log.YYYY.jsonl`.
- **Unix only:** `hook.sh` requires a POSIX shell and Node.js on PATH. Windows requires WSL.

## Accuracy Claim

> *"Estimates are accurate to within ±50% of empirically measured values, based on Li et al. 2023 (arXiv:2304.03271). The model is directionally correct — more tokens always means more water. Absolute values depend on which data centre handled your request, which Anthropic does not publicly disclose. We report a low/mid/high range rather than a single figure. The token weighting system improves accuracy when the token mix is known, but the weights themselves carry an additional ±factor-of-2 uncertainty."*

---

## References

1. **Li, P., Yang, J., Islam, M.A., & Ren, S. (2023).** Making AI Less "Thirsty": Uncovering and Addressing the Secret Water Footprint of AI Models. *arXiv:2304.03271.*
2. **AWS (2022).** AWS 2022 Sustainability Report. Amazon Web Services.
3. **ASHRAE (2021).** Data Center Power and Cooling Best Practices.
4. **Luccioni, A.S., Viguier, S., & Ligozat, A.L. (2023).** Estimating the Carbon Footprint of BLOOM. *Journal of Machine Learning Research.*
