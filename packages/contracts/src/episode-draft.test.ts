import { describe, expect, it } from "vitest";
import {
  EPISODE_SCRIPT_MAX_LENGTH,
  EPISODE_SCRIPT_MIN_LENGTH,
  EPISODE_TITLE_MAX_LENGTH,
  episodeDraftInputSchema,
} from "./episode-draft.js";

/**
 * The input the script step of the creation wizard collects
 * (`docs/ai-comic-drama-saas-design.md` §7.1).
 *
 * It lives in contracts rather than in the Web app because it is the same shape
 * the API will accept when F-05 turns a script into scenes. Keeping it here is
 * what stops a second, hand written copy appearing on the server side.
 */

const script = "A".repeat(EPISODE_SCRIPT_MIN_LENGTH);

describe("episode draft input", () => {
  it("accepts a title and a script", () => {
    const result = episodeDraftInputSchema.safeParse({ title: "Rooftop Confession", script });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "Rooftop Confession", script });
  });

  it("trims surrounding whitespace before checking length", () => {
    // A field holding only spaces has to fail as empty rather than pass as three
    // characters, and a pasted script usually arrives with a trailing newline.
    const result = episodeDraftInputSchema.safeParse({
      title: "  Rooftop Confession  ",
      script: `\n${script}\n`,
    });

    expect(result.data?.title).toBe("Rooftop Confession");
    expect(result.data?.script).toBe(script);
    expect(episodeDraftInputSchema.safeParse({ title: "   ", script }).success).toBe(false);
  });

  it("requires a title within the documented length", () => {
    expect(episodeDraftInputSchema.safeParse({ title: "", script }).success).toBe(false);
    expect(
      episodeDraftInputSchema.safeParse({ title: "A".repeat(EPISODE_TITLE_MAX_LENGTH), script })
        .success,
    ).toBe(true);
    expect(
      episodeDraftInputSchema.safeParse({ title: "A".repeat(EPISODE_TITLE_MAX_LENGTH + 1), script })
        .success,
    ).toBe(false);
  });

  it("refuses a script too short to produce scenes", () => {
    // The floor exists so the parse step is not asked to build a 5 to 10 minute
    // episode out of a sentence.
    const result = episodeDraftInputSchema.safeParse({
      title: "Rooftop Confession",
      script: "A".repeat(EPISODE_SCRIPT_MIN_LENGTH - 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["script"]);
  });

  it("refuses a script beyond the documented ceiling", () => {
    expect(
      episodeDraftInputSchema.safeParse({
        title: "Rooftop Confession",
        script: "A".repeat(EPISODE_SCRIPT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    // The schema is the request body once F-05 exists, so a stray field is a
    // client and server disagreement worth failing on rather than ignoring.
    expect(
      episodeDraftInputSchema.safeParse({ title: "Rooftop Confession", script, seriesId: "abc" })
        .success,
    ).toBe(false);
  });

  it("reports one issue per invalid field so a form can show both", () => {
    const result = episodeDraftInputSchema.safeParse({ title: "", script: "" });

    expect(new Set(result.error?.issues.map((issue) => issue.path[0]))).toEqual(
      new Set(["title", "script"]),
    );
  });
});
