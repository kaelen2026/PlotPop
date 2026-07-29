import { describe, expect, it } from "vitest";
import { percentile, summarize } from "./percentiles.js";

const oneToHundred = Array.from({ length: 100 }, (_, index) => index + 1);

describe("percentile", () => {
  it("returns the only observation there is", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it("returns an observation that actually happened, never an interpolation", () => {
    // An interpolated cost is a cost nobody was ever charged, and an interpolated
    // latency is a wait nobody ever had. Nearest rank keeps the report quotable.
    expect(percentile([1, 2], 50)).toBe(1);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it("puts p50 and p95 where the definition says", () => {
    expect(percentile(oneToHundred, 50)).toBe(50);
    expect(percentile(oneToHundred, 95)).toBe(95);
    expect(percentile(oneToHundred, 100)).toBe(100);
  });

  it("holds for the thirty samples F-00 actually collects", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => index + 1);

    // ceil(0.95 * 30) = 29, so p95 is the 29th smallest of 30.
    expect(percentile(thirty, 95)).toBe(29);
    expect(percentile(thirty, 50)).toBe(15);
  });

  it("does not care what order the samples arrived in", () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });

  it("refuses an empty sample rather than reporting zero", () => {
    expect(() => percentile([], 50)).toThrow(/no observations/i);
  });

  it("refuses a percentile outside the range it can mean anything in", () => {
    expect(() => percentile([1, 2, 3], 0)).toThrow(/percentile/i);
    expect(() => percentile([1, 2, 3], 101)).toThrow(/percentile/i);
  });
});

describe("summary", () => {
  it("describes a sample end to end", () => {
    expect(summarize([2, 4, 6, 8])).toEqual({
      count: 4,
      total: 20,
      mean: 5,
      min: 2,
      p50: 4,
      p95: 8,
      max: 8,
    });
  });

  it("reports nothing for an empty sample, so a report can say 'not measured'", () => {
    expect(summarize([])).toBeNull();
  });
});
