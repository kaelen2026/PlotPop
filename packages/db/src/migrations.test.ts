import { describe, expect, it } from "vitest";
import { parseMigrationFileName } from "./migrations.js";

/**
 * The naming rule is the whole ordering guarantee, so it is enforced rather than
 * assumed: an unparsable file name fails the run instead of being skipped, which
 * is the failure mode that leaves a database half migrated and looking fine.
 */
describe("migration file names", () => {
  it("reads the ordering version and the description out of the file name", () => {
    expect(parseMigrationFileName("0001_better_auth_identity.sql")).toEqual({
      version: "0001",
      name: "better_auth_identity",
      fileName: "0001_better_auth_identity.sql",
    });
  });

  it.each([
    ["1_workspace.sql", "a version shorter than four digits sorts wrongly past 9"],
    ["0001-workspace.sql", "the separator is an underscore"],
    ["0001_Workspace.sql", "descriptions are lower snake case"],
    ["0001_workspace.up.sql", "migrations are forward only, so there is no up or down half"],
    ["0001.sql", "a version with no description says nothing in a review"],
    ["workspace.sql", "an unversioned file has no place in the order"],
    ["0001_workspace.txt", "only .sql files are migrations"],
  ])("rejects %s because %s", (fileName) => {
    expect(() => parseMigrationFileName(fileName)).toThrow(fileName);
  });
});
