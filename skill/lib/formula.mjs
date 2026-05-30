import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const HOME = process.env.HOME;
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

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
