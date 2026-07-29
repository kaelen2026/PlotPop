import { describe, expect, it } from "vitest";
import { parseHarnessConfig } from "./config.js";

const realProvider = {
  PLOTPOP_RESEARCH_PROVIDER: "replicate",
  PLOTPOP_RESEARCH_API_TOKEN: "r8_secret",
  PLOTPOP_RESEARCH_MODEL: "vendor/video-model",
  PLOTPOP_RESEARCH_UNIT_PRICE_USD: "0.08",
  PLOTPOP_RESEARCH_SPEND_CAP_USD: "40",
};

const noon = new Date("2026-07-29T12:00:00.000Z");

describe("harness configuration", () => {
  it("runs offline with no credentials at all, so a dry run cannot cost anything", () => {
    const config = parseHarnessConfig({}, noon);

    expect(config.provider).toBe("fake");
    expect(config.apiToken).toBeNull();
    expect(config.unitPriceUsd).toBeNull();
  });

  it("derives a run id from the date when none is given", () => {
    expect(parseHarnessConfig({}, noon).runId).toBe("2026-07-29-fake-standard");
  });

  it("keeps a run id the operator chose, so a resume lands in the same directory", () => {
    expect(parseHarnessConfig({ PLOTPOP_RESEARCH_RUN_ID: "gate-a-take-2" }, noon).runId).toBe(
      "gate-a-take-2",
    );
  });

  it("accepts a fully configured real provider", () => {
    const config = parseHarnessConfig(realProvider, noon);

    expect(config).toMatchObject({
      provider: "replicate",
      apiToken: "r8_secret",
      model: "vendor/video-model",
      unitPriceUsd: 0.08,
      spendCapUsd: 40,
      tier: "standard",
      concurrency: 1,
      maxAttemptsPerShot: 4,
    });
  });

  it("refuses a real provider with no token, naming the variable", () => {
    const { PLOTPOP_RESEARCH_API_TOKEN: _omitted, ...rest } = realProvider;

    expect(() => parseHarnessConfig(rest, noon)).toThrow(/PLOTPOP_RESEARCH_API_TOKEN/);
  });

  it("refuses a real provider with no unit price rather than assuming one", () => {
    // A guessed price produces a unit economics report that reads as measured.
    const { PLOTPOP_RESEARCH_UNIT_PRICE_USD: _omitted, ...rest } = realProvider;

    expect(() => parseHarnessConfig(rest, noon)).toThrow(/PLOTPOP_RESEARCH_UNIT_PRICE_USD/);
  });

  it("refuses a real provider with no spend cap", () => {
    // §32.2 requires a confirmed ceiling before spending; an experiment is no
    // different, and this one runs unattended.
    const { PLOTPOP_RESEARCH_SPEND_CAP_USD: _omitted, ...rest } = realProvider;

    expect(() => parseHarnessConfig(rest, noon)).toThrow(/PLOTPOP_RESEARCH_SPEND_CAP_USD/);
  });

  it("refuses a real provider with no model", () => {
    const { PLOTPOP_RESEARCH_MODEL: _omitted, ...rest } = realProvider;

    expect(() => parseHarnessConfig(rest, noon)).toThrow(/PLOTPOP_RESEARCH_MODEL/);
  });

  it("names every missing variable at once instead of one per run", () => {
    const message = (() => {
      try {
        parseHarnessConfig({ PLOTPOP_RESEARCH_PROVIDER: "replicate" }, noon);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : "";
      }
    })();

    expect(message).toContain("PLOTPOP_RESEARCH_API_TOKEN");
    expect(message).toContain("PLOTPOP_RESEARCH_MODEL");
    expect(message).toContain("PLOTPOP_RESEARCH_UNIT_PRICE_USD");
    expect(message).toContain("PLOTPOP_RESEARCH_SPEND_CAP_USD");
  });

  it("never repeats the token back in an error message", () => {
    const message = (() => {
      try {
        parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_SPEND_CAP_USD: "nonsense" }, noon);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : "";
      }
    })();

    expect(message).not.toContain("r8_secret");
  });

  it("rejects an unknown provider by name", () => {
    expect(() =>
      parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_PROVIDER: "midjourney" }, noon),
    ).toThrow(/PLOTPOP_RESEARCH_PROVIDER/);
  });

  it("caps attempts per shot at Gate B's budget of one generation plus three redos", () => {
    expect(() =>
      parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_MAX_ATTEMPTS: "5" }, noon),
    ).toThrow(/PLOTPOP_RESEARCH_MAX_ATTEMPTS/);
    expect(
      parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_MAX_ATTEMPTS: "4" }, noon)
        .maxAttemptsPerShot,
    ).toBe(4);
  });

  it("defaults concurrency to one, because a rate limit costs a run more than time", () => {
    expect(parseHarnessConfig(realProvider, noon).concurrency).toBe(1);
  });

  it("rejects a negative unit price", () => {
    expect(() =>
      parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_UNIT_PRICE_USD: "-1" }, noon),
    ).toThrow(/PLOTPOP_RESEARCH_UNIT_PRICE_USD/);
  });

  it("rejects a spend cap of zero, which would stop the run before it started", () => {
    expect(() =>
      parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_SPEND_CAP_USD: "0" }, noon),
    ).toThrow(/PLOTPOP_RESEARCH_SPEND_CAP_USD/);
  });

  it("reads the tier the run is measuring", () => {
    expect(parseHarnessConfig({ ...realProvider, PLOTPOP_RESEARCH_TIER: "pro" }, noon).tier).toBe(
      "pro",
    );
  });
});
