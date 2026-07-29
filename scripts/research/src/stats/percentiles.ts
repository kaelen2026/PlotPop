/**
 * Percentiles for the P50 / P95 figures §34.1 asks for.
 *
 * Nearest rank, not linear interpolation. With thirty samples the two disagree by
 * a visible amount, and interpolation returns a number nobody observed: an
 * interpolated cost is a cost nobody was charged and an interpolated latency is a
 * wait nobody had. Everything in the unit economics report ends up quoted at
 * somebody, so every figure in it should be a real observation.
 *
 * `percentile(values, 95)` is the smallest observation that at least 95% of the
 * sample is less than or equal to: index `ceil(p/100 * n) - 1` of the sorted
 * sample.
 */

export type Summary = {
  readonly count: number;
  readonly total: number;
  readonly mean: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
};

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    throw new Error("cannot take a percentile of no observations");
  }
  if (!(p > 0 && p <= 100)) {
    throw new Error(`percentile must be in (0, 100], got ${p}`);
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  const value = sorted[index];

  if (value === undefined) throw new Error(`percentile ${p} fell outside the sample`);

  return value;
}

/** `null` for an empty sample, so a report can say "not measured" and mean it. */
export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count: values.length,
    total,
    mean: total / values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
  };
}
