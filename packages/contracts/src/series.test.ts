import { describe, expect, it } from "vitest";
import {
  SERIES_NAME_MAX_LENGTH,
  seriesCreateInputSchema,
  seriesListSchema,
  seriesRenameInputSchema,
  seriesSchema,
} from "./series.js";

/**
 * The Series contract (`docs/ai-comic-drama-saas-design.md` §6.1, §20.2).
 *
 * One definition, read by the api that writes it, the repository that stores it
 * and the form that submits it (`docs/implementation-plan.md` §2). What is pinned
 * here is what every one of them is entitled to assume.
 */

const series = {
  id: "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f",
  name: "Rooftop Confessions",
  revision: 1,
  createdAt: "2026-07-30T09:00:00.000Z",
};

describe("series", () => {
  it("carries an unpredictable id, a name, a revision and a creation time", () => {
    expect(seriesSchema.parse(series)).toEqual(series);
  });

  it("refuses a sequential id", () => {
    // §20.4: a public id must reveal neither volume nor ordering, which is why
    // the column is a uuid and why the contract will not accept anything else.
    expect(seriesSchema.safeParse({ ...series, id: "42" }).success).toBe(false);
  });

  it("refuses a revision that no row could hold", () => {
    // A row starts at 1 (`migrations/0002_series.sql`), so zero means the payload
    // was assembled by something other than a read of the table.
    expect(seriesSchema.safeParse({ ...series, revision: 0 }).success).toBe(false);
    expect(seriesSchema.safeParse({ ...series, revision: 1.5 }).success).toBe(false);
  });

  it("refuses fields it does not describe", () => {
    // The owning workspace is not in the payload, and an api that started sending
    // it should fail here rather than reach a browser.
    expect(seriesSchema.safeParse({ ...series, workspaceId: series.id }).success).toBe(false);
  });

  it("lists series under a key, leaving room for a pagination cursor", () => {
    expect(seriesListSchema.parse({ series: [series] })).toEqual({ series: [series] });
    expect(seriesListSchema.parse({ series: [] })).toEqual({ series: [] });
  });
});

describe("series create input", () => {
  it("accepts a name", () => {
    expect(seriesCreateInputSchema.parse({ name: "Rooftop Confessions" })).toEqual({
      name: "Rooftop Confessions",
    });
  });

  it("trims surrounding whitespace before checking length", () => {
    // A name of three spaces has to fail as empty rather than pass as three
    // characters, and the database rejects a blank name too — this is the boundary
    // that explains it to the person typing.
    expect(seriesCreateInputSchema.parse({ name: "  Rooftop Confessions  " })).toEqual({
      name: "Rooftop Confessions",
    });
    expect(seriesCreateInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("requires a name within the documented length", () => {
    expect(seriesCreateInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      seriesCreateInputSchema.safeParse({ name: "A".repeat(SERIES_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      seriesCreateInputSchema.safeParse({ name: "A".repeat(SERIES_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("refuses to create anything but a name", () => {
    // Everything else in §6.1 belongs to a later slice. Accepting a field no
    // column stores would look like it worked.
    expect(
      seriesCreateInputSchema.safeParse({ name: "Rooftop Confessions", revision: 1 }).success,
    ).toBe(false);
  });
});

describe("series rename input", () => {
  it("carries the new name and the revision the caller read", () => {
    expect(seriesRenameInputSchema.parse({ name: "Rooftop Confessions", revision: 3 })).toEqual({
      name: "Rooftop Confessions",
      revision: 3,
    });
  });

  it("refuses a rename with no revision to check against", () => {
    // §20.6: without one, the update overwrites whatever someone else changed in the
    // meantime, and nobody finds out. It is required rather than defaulted, because a
    // default would be this contract inventing a value it cannot know.
    expect(seriesRenameInputSchema.safeParse({ name: "Rooftop Confessions" }).success).toBe(false);
    expect(
      seriesRenameInputSchema.safeParse({ name: "Rooftop Confessions", revision: 0 }).success,
    ).toBe(false);
  });

  it("holds the new name to the same rules as a created one", () => {
    expect(seriesRenameInputSchema.parse({ name: "  Midnight Diner  ", revision: 1 }).name).toBe(
      "Midnight Diner",
    );
    expect(seriesRenameInputSchema.safeParse({ name: "   ", revision: 1 }).success).toBe(false);
    expect(
      seriesRenameInputSchema.safeParse({
        name: "A".repeat(SERIES_NAME_MAX_LENGTH + 1),
        revision: 1,
      }).success,
    ).toBe(false);
  });
});
