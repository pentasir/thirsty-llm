import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { homedir } from 'os';

const HOME = homedir();   // cross-platform: $HOME on Unix, %USERPROFILE% on Windows
const FORMULA_PATH = `${HOME}/.claude/formula.json`;

let _formula = null;

function getFormula() {
  if (!_formula) _formula = JSON.parse(readFileSync(FORMULA_PATH, 'utf8'));
  return _formula;
}

/**
 * Calculate water usage in mL for a single turn's token counts.
 * @param {object} usage - { in, out, cache_r, cache_w }
 * @param {string} model - model ID string
 * @returns {{ lo: number, mid: number, hi: number }}
 */
export function calculateWater(usage, model) {
  const f = getFormula();
  const w = f.token_weights;

  const pricing    = f.model_pricing_per_mtok_output_usd;
  const basePrice  = pricing[f.baseline_model];
  const modelPrice = pricing[model] ?? pricing.default;
  const mult       = basePrice > 0 ? (modelPrice / basePrice) : 1.0;

  const rates = f.ml_per_effective_token;

  const effective =
    ((usage.out     ?? 0) * w.output.weight) +
    ((usage.in      ?? 0) * w.input_fresh.weight) +
    ((usage.cache_w ?? 0) * w.cache_creation.weight) +
    ((usage.cache_r ?? 0) * w.cache_read.weight);

  const scaled = effective * mult;

  return {
    lo:  round3(scaled * rates.low),
    mid: round3(scaled * rates.mid),
    hi:  round3(scaled * rates.high),
  };
}

/**
 * Run the built-in validation test from formula.json.
 * Throws if the formula output deviates beyond tolerance.
 */
export function validate() {
  const f = getFormula();
  const v = f.validation;
  const result = calculateWater(
    { in: 0, out: v.test_input_effective_tokens, cache_r: 0, cache_w: 0 },
    f.baseline_model
  );
  const deviation = Math.abs(result.mid - v.expected_mid_ml) / v.expected_mid_ml * 100;
  if (deviation > v.tolerance_pct) {
    throw new Error(`Validation failed: expected ${v.expected_mid_ml}mL, got ${result.mid}mL (${deviation.toFixed(1)}% deviation)`);
  }
  return { ok: true, expected: v.expected_mid_ml, got: result.mid, deviation_pct: deviation.toFixed(2) };
}

/**
 * Structural sanity checks on the pricing block. Guards against contributor
 * edits to formula.json — a deleted baseline, a non-numeric price, or a typo
 * that throws a multiplier wildly out of range (e.g. $250 instead of $25).
 *
 * It deliberately does NOT verify prices are *current* — that's a manual step
 * against the live pricing page, because the tool is offline by design and has
 * no ground truth to compare against. Stale-but-plausible prices (the patch-3
 * failure mode) can only be caught by a human re-checking, so we surface a
 * dated reminder as a warning instead of pretending to validate it.
 *
 * @param {object} [formula] - parsed formula.json (defaults to the live file)
 * @returns {{ errors: string[], warnings: string[] }} - callers decide fatality
 */
export function checkPricing(formula = getFormula()) {
  const errors = [];
  const warnings = [];

  const pricing = formula.model_pricing_per_mtok_output_usd;
  if (!pricing) {
    errors.push('model_pricing_per_mtok_output_usd block is missing');
    return { errors, warnings };
  }

  const baseModel = formula.baseline_model;
  const basePrice = pricing[baseModel];
  if (!baseModel)             errors.push('baseline_model is not set');
  else if (!(basePrice > 0))  errors.push(`baseline_model "${baseModel}" has no positive price`);
  if (!(pricing.default > 0)) errors.push('pricing.default is missing or not a positive number');

  // With a valid baseline, every derived multiplier should be in a sane range.
  // Bounds are a typo guard, not a precision claim — real multipliers today
  // span Haiku 0.33x to Opus 1.67x, so 0.01x–10x leaves wide headroom.
  if (basePrice > 0) {
    const MIN_MULT = 0.01;
    const MAX_MULT = 10;
    for (const [model, price] of Object.entries(pricing)) {
      if (model.startsWith('_') || model === 'default') continue;
      if (typeof price !== 'number' || !(price > 0)) {
        errors.push(`price for "${model}" is not a positive number`);
        continue;
      }
      const mult = price / basePrice;
      if (mult < MIN_MULT || mult > MAX_MULT) {
        errors.push(`multiplier for "${model}" is ${mult.toFixed(3)}× (outside ${MIN_MULT}–${MAX_MULT}× — likely a pricing typo)`);
      }
    }
  }

  // Staleness: prices are verified by hand against the live pricing page.
  // Warn (never fail) if that was long ago — this is the patch-3 reminder.
  const STALE_DAYS = 120;
  const checked = pricing._checked;
  if (!checked) {
    warnings.push('pricing has no _checked date — add one when you verify against anthropic.com/pricing');
  } else {
    const days = Math.floor((Date.now() - new Date(`${checked}T00:00:00Z`).getTime()) / 86400000);
    if (days > STALE_DAYS) {
      warnings.push(`pricing last verified ${checked} (${days} days ago) — re-check against anthropic.com/pricing`);
    }
  }

  return { errors, warnings };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
