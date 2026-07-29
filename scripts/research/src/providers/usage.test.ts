import { describe, expect, it } from "vitest";
import type { MediaFacts } from "../media/ffprobe.js";
import { resolveUsage } from "./usage.js";

const media: MediaFacts = {
  container: "mp4",
  videoCodec: "h264",
  width: 1280,
  height: 720,
  frameRate: 24,
  durationSeconds: 5.021,
  bitrateBps: null,
  pixelFormat: null,
  frameCount: 120,
  audio: null,
};

describe("billable usage", () => {
  it("bills output seconds off the file that was actually delivered", () => {
    // Not off the requested length: a provider that returned 4.6 seconds for a 5
    // second request may well have billed 4.6.
    expect(
      resolveUsage({
        unit: "output_second",
        unitPriceUsd: 0.08,
        media,
        providerComputeSeconds: null,
      }),
    ).toEqual({
      unit: "output_second",
      quantity: 5.021,
      unitPriceUsd: 0.08,
      costUsd: 0.40168,
      reportedByProvider: false,
    });
  });

  it("bills compute seconds only when the provider reported them", () => {
    expect(
      resolveUsage({
        unit: "compute_second",
        unitPriceUsd: 0.001,
        media,
        providerComputeSeconds: 42.5,
      }),
    ).toEqual({
      unit: "compute_second",
      quantity: 42.5,
      unitPriceUsd: 0.001,
      costUsd: 0.0425,
      reportedByProvider: true,
    });
  });

  it("reports nothing when the provider was supposed to report compute time and did not", () => {
    // Deriving a compute time from our own request would be an invention, and it
    // would read as a measurement in the report.
    expect(
      resolveUsage({
        unit: "compute_second",
        unitPriceUsd: 0.001,
        media,
        providerComputeSeconds: null,
      }),
    ).toBeNull();
  });

  it("bills a flat request as exactly one, which needs nothing measured", () => {
    expect(
      resolveUsage({
        unit: "request",
        unitPriceUsd: 0.35,
        media: null,
        providerComputeSeconds: null,
      }),
    ).toEqual({
      unit: "request",
      quantity: 1,
      unitPriceUsd: 0.35,
      costUsd: 0.35,
      reportedByProvider: true,
    });
  });

  it("bills generated frames off the frame count ffprobe counted", () => {
    expect(
      resolveUsage({
        unit: "generated_frame",
        unitPriceUsd: 0.0001,
        media,
        providerComputeSeconds: null,
      }),
    ).toMatchObject({ quantity: 120, costUsd: 0.012, reportedByProvider: false });
  });

  it("derives a frame count from duration and rate when ffprobe did not count one", () => {
    expect(
      resolveUsage({
        unit: "generated_frame",
        unitPriceUsd: 0.0001,
        media: { ...media, frameCount: null },
        providerComputeSeconds: null,
      }),
    ).toMatchObject({ quantity: 121 });
  });

  it("reports nothing for an attempt with no output and no reported compute", () => {
    expect(
      resolveUsage({
        unit: "output_second",
        unitPriceUsd: 0.08,
        media: null,
        providerComputeSeconds: null,
      }),
    ).toBeNull();
  });

  it("rounds cost to the precision the record will accept", () => {
    const usage = resolveUsage({
      unit: "output_second",
      unitPriceUsd: 0.075,
      media,
      providerComputeSeconds: null,
    });

    expect(usage?.costUsd).toBe(0.376575);
  });
});
