import { describe, expect, it } from "vitest";
import type { MediaFacts } from "./media/ffprobe.js";
import { describeTierDrift, qualityTierSchema, tierRequests } from "./tiers.js";

function delivered(overrides: Partial<MediaFacts> = {}): MediaFacts {
  return {
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    width: 1280,
    height: 720,
    frameRate: 24,
    durationSeconds: 5,
    bitrateBps: 1_500_000,
    pixelFormat: "yuv420p",
    frameCount: 120,
    audio: null,
    ...overrides,
  };
}

describe("tier requests", () => {
  it("declares a request for every tier the product exposes", () => {
    for (const tier of qualityTierSchema.options) {
      expect(tierRequests[tier].tier).toBe(tier);
    }
  });

  it("keeps draft cheaper to render than standard, which is the only reason it exists", () => {
    const draftPixels = tierRequests.draft.width * tierRequests.draft.height;
    const standardPixels = tierRequests.standard.width * tierRequests.standard.height;

    expect(draftPixels).toBeLessThan(standardPixels);
  });

  it("keeps every tier's shot ceiling inside the three-to-eight-second window", () => {
    for (const tier of qualityTierSchema.options) {
      expect(tierRequests[tier].maxShotSeconds).toBeGreaterThanOrEqual(3);
      expect(tierRequests[tier].maxShotSeconds).toBeLessThanOrEqual(8);
    }
  });
});

describe("tier drift", () => {
  it("reports nothing when the provider delivered what standard asked for", () => {
    expect(describeTierDrift(delivered(), tierRequests.standard, 5)).toEqual([]);
  });

  it("names a downscaled frame, because the tier promise is what the user paid for", () => {
    const drift = describeTierDrift(
      delivered({ width: 854, height: 480 }),
      tierRequests.standard,
      5,
    );

    expect(drift).toEqual([{ field: "resolution", requested: "1280x720", delivered: "854x480" }]);
  });

  it("accepts a frame larger than requested, which costs the user nothing", () => {
    expect(
      describeTierDrift(delivered({ width: 1920, height: 1080 }), tierRequests.standard, 5),
    ).toEqual([]);
  });

  it("names a frame rate that missed by more than a rounding tolerance", () => {
    const drift = describeTierDrift(delivered({ frameRate: 16 }), tierRequests.standard, 5);

    expect(drift.map((entry) => entry.field)).toEqual(["frameRate"]);
  });

  it("tolerates an NTSC rate delivered against an integer request", () => {
    // 23.976 against a 24 request is the same footage, not a broken tier.
    expect(describeTierDrift(delivered({ frameRate: 23.976 }), tierRequests.standard, 5)).toEqual(
      [],
    );
  });

  it("names a clip that came back materially shorter than the shot asked for", () => {
    const drift = describeTierDrift(delivered({ durationSeconds: 4 }), tierRequests.standard, 5);

    expect(drift).toEqual([{ field: "duration", requested: "5s", delivered: "4s" }]);
  });

  it("tolerates the fraction of a second encoders add or drop", () => {
    expect(
      describeTierDrift(delivered({ durationSeconds: 5.2 }), tierRequests.standard, 5),
    ).toEqual([]);
  });

  it("reports every field that drifted, not just the first", () => {
    const drift = describeTierDrift(
      delivered({ width: 640, height: 360, frameRate: 12, durationSeconds: 2 }),
      tierRequests.standard,
      5,
    );

    expect(drift.map((entry) => entry.field)).toEqual(["resolution", "frameRate", "duration"]);
  });
});
