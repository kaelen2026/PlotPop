import { describe, expect, it } from "vitest";
import {
  parseSequenceScoreCsv,
  parseShotScoreCsv,
  renderSequenceScoreCsv,
  renderShotScoreCsv,
  sequenceScoreHeader,
  shotScoreHeader,
  shotScoreSchema,
} from "./scores.js";

const header = shotScoreHeader.join(",");
const sequenceHeader = sequenceScoreHeader.join(",");

describe("the scorecard schema", () => {
  it("accepts a pass with no diagnosis", () => {
    expect(
      shotScoreSchema.safeParse({
        code: "sample-01",
        raterId: "rater-1",
        publishable: true,
        diagnostics: null,
      }).success,
    ).toBe(true);
  });

  it("refuses a failure with no diagnosis, which §3.2 requires", () => {
    const result = shotScoreSchema.safeParse({
      code: "sample-01",
      raterId: "rater-1",
      publishable: false,
      diagnostics: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/§3\.2/);
  });

  it("refuses a diagnostic outside the one-to-five scale", () => {
    expect(
      shotScoreSchema.safeParse({
        code: "sample-01",
        raterId: "rater-1",
        publishable: false,
        diagnostics: {
          characterIdentity: 0,
          wardrobe: 3,
          artStyle: 3,
          sceneContinuity: 3,
          motionUsability: 3,
        },
      }).success,
    ).toBe(false);
  });
});

describe("reading a filled scorecard", () => {
  it("reads a pass and a failure", () => {
    const csv = [
      header,
      "sample-01,rater-1,yes,,,,,,looks fine",
      'sample-02,rater-1,no,2,4,5,3,3,"face changed, and it drifts"',
    ].join("\n");

    expect(parseShotScoreCsv(csv)).toEqual([
      {
        code: "sample-01",
        raterId: "rater-1",
        publishable: true,
        diagnostics: null,
        notes: "looks fine",
      },
      {
        code: "sample-02",
        raterId: "rater-1",
        publishable: false,
        diagnostics: {
          characterIdentity: 2,
          wardrobe: 4,
          artStyle: 5,
          sceneContinuity: 3,
          motionUsability: 3,
        },
        notes: "face changed, and it drifts",
      },
    ]);
  });

  it("accepts the spellings a person actually types", () => {
    const csv = [header, "sample-01,rater-1,Y,,,,,,", "sample-02,rater-1,FALSE,3,3,3,3,3,"].join(
      "\n",
    );

    expect(parseShotScoreCsv(csv).map((score) => score.publishable)).toEqual([true, false]);
  });

  it("refuses a header that is not the one handed out", () => {
    expect(() => parseShotScoreCsv("sample,rater,ok\nsample-01,rater-1,yes")).toThrow(
      /unexpected scorecard header/,
    );
  });

  it("refuses a verdict that is neither yes nor no, naming the row", () => {
    expect(() => parseShotScoreCsv([header, "sample-01,rater-1,maybe,,,,,,"].join("\n"))).toThrow(
      /row 2/,
    );
  });

  it("refuses a half-filled diagnosis rather than averaging over the gaps", () => {
    // Three of five dimensions is a scorecard somebody stopped filling in.
    expect(() => parseShotScoreCsv([header, "sample-01,rater-1,no,2,3,4,,,"].join("\n"))).toThrow(
      /all five/,
    );
  });

  it("refuses a failure with no diagnosis at all", () => {
    expect(() => parseShotScoreCsv([header, "sample-01,rater-1,no,,,,,,"].join("\n"))).toThrow(
      /§3\.2/,
    );
  });

  it("refuses a row with the wrong number of columns", () => {
    expect(() => parseShotScoreCsv([header, "sample-01,rater-1,yes"].join("\n"))).toThrow(
      /expected 9 columns/,
    );
  });

  it("ignores blank lines a spreadsheet leaves behind", () => {
    expect(parseShotScoreCsv(`${header}\n\nsample-01,rater-1,yes,,,,,,\n\n`)).toHaveLength(1);
  });

  it("refuses an empty file", () => {
    expect(() => parseShotScoreCsv("")).toThrow(/empty/);
  });
});

describe("handing out a blank scorecard", () => {
  it("writes one row per sample, in the order the packet presents them", () => {
    const csv = renderShotScoreCsv(["sample-03", "sample-01", "sample-02"], "rater-2");
    const rows = csv.trimEnd().split("\n");

    expect(rows[0]).toBe(header);
    expect(rows.slice(1).map((row) => row.split(",")[0])).toEqual([
      "sample-03",
      "sample-01",
      "sample-02",
    ]);
    expect(rows[1]).toContain("rater-2");
  });

  it("round trips through the parser once a rater fills it in", () => {
    const blank = renderShotScoreCsv(["sample-01"], "rater-2");
    const filled = blank.replace("sample-01,rater-2,,", "sample-01,rater-2,yes,");

    expect(parseShotScoreCsv(filled)).toEqual([
      { code: "sample-01", raterId: "rater-2", publishable: true, diagnostics: null, notes: "" },
    ]);
  });
});

describe("the Gate D scorecard", () => {
  it("reads one verdict per rater", () => {
    const csv = [
      sequenceHeader,
      "rater-1,yes,it holds together",
      "rater-2,no,the middle drags",
    ].join("\n");

    expect(parseSequenceScoreCsv(csv)).toEqual([
      { raterId: "rater-1", willingToPublish: true, notes: "it holds together" },
      { raterId: "rater-2", willingToPublish: false, notes: "the middle drags" },
    ]);
  });

  it("refuses a verdict left blank, so silence cannot count as a yes", () => {
    expect(() => parseSequenceScoreCsv([sequenceHeader, "rater-1,,"].join("\n"))).toThrow(/row 2/);
  });

  it("refuses the same rater answering twice", () => {
    expect(() =>
      parseSequenceScoreCsv([sequenceHeader, "rater-1,yes,", "rater-1,no,"].join("\n")),
    ).toThrow(/rater-1/);
  });

  it("hands out a blank row per rater", () => {
    const rows = renderSequenceScoreCsv(["rater-1", "rater-2"]).trimEnd().split("\n");

    expect(rows[0]).toBe(sequenceHeader);
    expect(rows).toHaveLength(3);
  });
});
