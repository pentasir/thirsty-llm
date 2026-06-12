# Water Footprint Methodology

**Version:** 1.3
**Primary source:** ML.ENERGY Leaderboard v3.0, Chung et al., NeurIPS 2025
**Methodology framework:** Li et al. 2023, arXiv:2304.03271
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
| Claude Fable 5 / Mythos 5 | $50/MTok | 3.33× |

```
scaled_tokens = effective_tokens × model_multiplier
```

**Pricing verified:** 2026-06-12 against the live Anthropic models documentation (https://platform.claude.com/docs/en/about-claude/models/overview.md). If Anthropic updates pricing, update `formula.json` and bump the `_checked` field. Models not in the table fall back to the baseline 1.00× multiplier — the terminal view and dashboard warn when this happens.

**Fable 5 caveat (v1.3.1):** Claude Fable 5 / Mythos 5 use a new tokenizer that produces ~30% more tokens than pre-Opus-4.7 models for the same content, so its per-token price embeds a different token granularity. The pricing-derived 3.33× multiplier is therefore a rougher proxy for this tier than for the 4.x family; the ±factor-of-2 band on multipliers absorbs this.

**Correction note (2026-05-30, patch 3):** All prices re-verified against the live page. Haiku 4.5 corrected $0.80→$5 (0.053×→0.33×); Sonnet 4.5 corrected $12→$15 (0.80×→1.00×, now matches baseline); Opus 4.5 $60→$25, Opus 4.7 $75→$25; Opus 4.6 and 4.8 added at $25. Sonnet 4.6 baseline unchanged — historical data unaffected.

**Caveats:**
- Pricing includes margin; multipliers should be treated as ±factor-of-2.
- We anchor the 1.0× baseline to Li et al.'s 0.014 mL/token figure, which was measured on GPT-3-class models. Sonnet 4.6's true per-token compute may differ; the directional accuracy (Haiku < Sonnet < Opus) is preserved by pricing ratios, but absolute magnitudes are what the ±50% band absorbs.
- **Prior versions of this tool had model multipliers drift from pricing** — Haiku coded at 0.3× (6× higher than pricing implies), Opus at 3.0× (40% lower than pricing implies). Patch 2 corrected this by storing raw pricing and deriving multipliers programmatically.

### Step 3 — Water Rate

We anchor to the ML.ENERGY Leaderboard v3.0 empirical measurement and derive three scenarios:

```
water_mL = scaled_tokens × rate

Rate (mL per effective token):
  Low  = 0.000036  (AWS modern data centre, cool climate, WUE ≈ 0.18 L/kWh)
  Mid  = 0.00036   (US average, WUE ≈ 1.8 L/kWh — ML.ENERGY anchor)
  High = 0.00079   (hot climate, older facility, WUE ≈ 4.0 L/kWh)
```

**Derivation of the mid rate:**
```
Llama 3.1 70B FP8 on 8×H100 (ML.ENERGY v3.0):  0.39 J/token (GPU via NVML)
Server overhead (GPU ≈ 55% of DGX H100 TDP):    × 1.82 = 0.71 J/token (IT load)
Convert to kWh:                                  ÷ 3,600,000 = 1.97×10⁻⁷ kWh/token
Apply US average WUE (1.8 L/kWh):               × 1800 mL/kWh = 0.000355 mL/token
Rounded to:                                      0.00036 mL/token
```

Low and high are scaled by the same WUE ratios (0.18 and 4.0 L/kWh) used in v1.2.

We always report all three. We never report a single number.

---

## Empirical Anchor

**v1.3 anchor — ML.ENERGY Leaderboard v3.0 (December 2025):**

ML.ENERGY measures actual GPU power consumption during inference using NVML (NVIDIA Management Library). For Llama 3.1 70B FP8 running on 8×H100 GPUs with vLLM:

```
GPU energy per output token:   ~0.39 J/token
Server overhead (×1.82):        0.71 J/token  (GPU ≈ 55% of DGX H100 TDP)
At US average WUE (1.8 L/kWh): 0.00036 mL/token (mid rate)
```

**Why Llama 70B as a Claude proxy:** Anthropic does not disclose Claude's architecture, parameter count, or energy use. Llama 3.1 70B is the closest publicly-measured model of plausible comparable scale. This introduces unknown but unquantifiable error; the ±50% uncertainty band is sized to absorb it.

**Arithmetic check:**
```
36,000 tokens × 0.00036 mL/token = 12.96 mL ≈ 13 mL ✓
```

**Comparison with prior Li et al. anchor:**

The v1.2 formula used Li et al. 2023's GPT-3 era figure of 0.014 mL/token. The lead author of that paper confirmed directly (2026-05-31) that those estimates should not be applied to modern models:

> *"Our study was based on the information available as of 2023 and focused on a specific model, GPT-3-175B. Since then, AI inference systems have improved significantly, so I would not recommend directly applying those estimates to today's models. The water-footprint methodology from our paper still applies, but I would recommend using more updated data sources for energy estimates. One useful resource is the ML.ENERGY leaderboard."*
> — Shaolei Ren (co-author, Li et al. 2023), email to Jason Don, 2026-05-31

The v1.3 mid rate (0.00036 mL/token) is **~39× lower** than the prior anchor (0.014 mL/token). This reflects measured improvements in inference efficiency: better hardware (H100 vs A100-era), optimised serving engines (vLLM, TensorRT-LLM), FP8 quantisation, and MoE architectural improvements.

**What this validates and what it does not:**

The arithmetic check confirms self-consistency. It does not independently validate the formula because the 0.00036 constant and the test above are derived from the same ML.ENERGY figure. The ±50% band absorbs: Anthropic's actual hardware vs Llama 70B proxy, real-world batch size variation, regional WUE uncertainty, and the gap between ML.ENERGY's GPU-only measurement and full-stack power.

**Prior v1.2 energy-chain cross-check (retained for reference):**

The v1.2 methodology.md contained an energy-chain estimate that gave 0.0047 mL/token — bracketing the Li et al. figure at 0.014 from below. That estimate was directionally consistent with the now-measured ML.ENERGY figure (0.00036–0.00079 range), though a factor of ~6–13× higher, likely because it assumed lower GPU utilisation and less optimised serving.

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
{"v":1,"formula_v":"1.3.1","ts":"2026-05-28T10:59:00Z","session":"abc123","model":"claude-sonnet-4-6","in":3,"out":153,"cache_r":12095,"cache_w":19036,"project":"career-ops","entrypoint":"cli","geo":null}
```

Water values are **not stored** in the log. They are derived on read from `formula.json`, so any formula update immediately propagates to all historical entries without migration.

**Privacy audit:** The log contains zero prompt content, zero response content, and no full filesystem paths. It does include the *name* of the project directory (the basename of `cwd`, e.g. `career-ops`) — this is a path component, not a full path. Users may omit the `project` field when sharing publicly. The `geo` field is null in all current entries; if Anthropic populates `inference_geo` in future, it will record a datacenter region identifier.

---

## Known Limitations

- **Model proxy is assumed:** ML.ENERGY measured Llama 3.1 70B FP8 on H100. We treat this as a reasonable Claude Sonnet-class proxy. Anthropic does not disclose Claude's architecture, parameter count, or energy use. Directional accuracy (Haiku < Sonnet < Opus) is preserved by pricing-derived multipliers; absolute magnitudes may differ.
- **Token weights are partially cited:** The 5:1 output:input ratio is pricing-derived, not measured. Cache_read (0.001×) is a floor value to prevent long-context dominance — not independently measured. Both remain open items for a future formula version.
- **Model multipliers are point estimates:** e.g. Opus's pricing-derived 1.67× is a point value; the true compute ratio may differ by a factor of ~2 in either direction. Using a point value understates total uncertainty.
- **Timezone handling:** Log entries are stored in UTC. "Today" and "this week" are computed in local time. Multi-day sessions that cross midnight may be split across days.
- **Log rotation:** After a year of heavy use the log may reach 50–100 MB. Parse time will grow. Future: archive old years to `water-log.YYYY.jsonl`.
- **Node.js required:** the hook needs Node.js on PATH. macOS/Linux register `hook.sh` (POSIX shell); native Windows is supported via `install.ps1`, which registers a direct `node` command — no WSL required.

## Accuracy Claim

> *"Estimates are anchored to ML.ENERGY Leaderboard v3.0 (Dec 2025) measured values for Llama 3.1 70B FP8 on H100 GPUs, applied to Claude via a model-size proxy. The model is directionally correct — more tokens always means more water. Absolute values depend on Anthropic's actual hardware, model architecture, and which data centre handled your request, none of which Anthropic publicly discloses. We report a low/mid/high range rather than a single figure. The prior Li et al. 2023 anchor (GPT-3 era) overestimated by ~39× on modern hardware; this v1.3 formula corrects for that. Residual uncertainty is ±50% or more."*

---

## References

1. **Chung, J., et al. (2025).** The ML.ENERGY Benchmark: Toward Automated Inference Energy Measurement and Optimization. *NeurIPS Datasets and Benchmarks 2025.* Data at https://ml.energy/leaderboard/
2. **Li, P., Yang, J., Islam, M.A., & Ren, S. (2023).** Making AI Less "Thirsty": Uncovering and Addressing the Secret Water Footprint of AI Models. *arXiv:2304.03271.* (Methodology framework and WUE values; GPT-3 era empirical anchor superseded by ref 1 for modern models.)
3. **AWS (2022).** AWS 2022 Sustainability Report. Amazon Web Services.
4. **ASHRAE (2021).** Data Center Power and Cooling Best Practices.
5. **Luccioni, A.S., Viguier, S., & Ligozat, A.L. (2023).** Estimating the Carbon Footprint of BLOOM. *Journal of Machine Learning Research.*
