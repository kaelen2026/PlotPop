import { z } from "zod";

/**
 * The scorecard, as a schema.
 *
 * `consistency-gate.md` §3 makes publishability the only judgement that decides
 * pass or fail, and the five diagnostic dimensions a record of *why* a failure
 * failed. §3.2 says a failed shot must carry them, so the schema requires them
 * exactly there: a "no" with no diagnosis cannot be filed, and a "yes" does not have
 * to invent one.
 */

export const diagnosticScoreSchema = z.number().int().min(1).max(5);

export const diagnosticsSchema = z.strictObject({
  characterIdentity: diagnosticScoreSchema,
  wardrobe: diagnosticScoreSchema,
  artStyle: diagnosticScoreSchema,
  sceneContinuity: diagnosticScoreSchema,
  motionUsability: diagnosticScoreSchema,
});

export type Diagnostics = z.infer<typeof diagnosticsSchema>;

export const shotScoreSchema = z
  .strictObject({
    code: z.string().min(1),
    raterId: z.string().min(1),
    /** §3.1: "as one shot of a serialised comic drama, can this ship as it is?" */
    publishable: z.boolean(),
    diagnostics: diagnosticsSchema.nullable(),
    notes: z.string().default(""),
  })
  .superRefine((score, ctx) => {
    if (!score.publishable && score.diagnostics === null) {
      ctx.addIssue({
        code: "custom",
        path: ["diagnostics"],
        message: `${score.code} was marked unpublishable with no diagnosis; §3.2 requires the five dimensions on a failure`,
      });
    }
  });

export type ShotScore = z.infer<typeof shotScoreSchema>;

export const sequenceScoreSchema = z.strictObject({
  raterId: z.string().min(1),
  /** §4 Gate D: "would you publish this stretch as part of an episode?" */
  willingToPublish: z.boolean(),
  notes: z.string().default(""),
});

export type SequenceScore = z.infer<typeof sequenceScoreSchema>;

export const shotScoreHeader = [
  "sample_code",
  "rater_id",
  "publishable",
  "character_identity",
  "wardrobe",
  "art_style",
  "scene_continuity",
  "motion_usability",
  "notes",
] as const;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else cell += character;
  }

  cells.push(cell);

  return cells.map((value) => value.trim());
}

const truthy = new Set(["yes", "y", "true", "1", "pass"]);
const falsy = new Set(["no", "n", "false", "0", "fail"]);

function readPublishable(value: string, where: string): boolean {
  const normalised = value.toLowerCase();

  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;

  throw new Error(`${where}: "${value}" is not a yes or a no`);
}

function readDiagnostic(value: string, where: string, column: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`${where}: ${column} must be a whole number from 1 to 5, got "${value}"`);
  }

  return parsed;
}

/**
 * Reads a scorecard a rater filled in a spreadsheet.
 *
 * CSV because that is what a rater can actually be handed. The parse is strict
 * about the header and about partial diagnostics: a row with three of the five
 * dimensions filled in is a scorecard somebody stopped filling, and averaging over
 * it silently would be worse than refusing it.
 */
export function parseShotScoreCsv(text: string): ShotScore[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const header = lines.shift();
  if (header === undefined) throw new Error("the scorecard is empty");

  const columns = splitCsvLine(header).map((name) => name.toLowerCase());
  if (columns.join(",") !== shotScoreHeader.join(",")) {
    throw new Error(
      `unexpected scorecard header.\n  expected: ${shotScoreHeader.join(",")}\n  found:    ${columns.join(",")}`,
    );
  }

  return lines.map((line, index) => {
    const where = `row ${index + 2}`;
    const cells = splitCsvLine(line);

    if (cells.length !== shotScoreHeader.length) {
      throw new Error(
        `${where}: expected ${shotScoreHeader.length} columns, found ${cells.length}`,
      );
    }

    const [code, raterId, publishable, ...rest] = cells as [string, string, string, ...string[]];
    const diagnosticNames = [
      "character_identity",
      "wardrobe",
      "art_style",
      "scene_continuity",
      "motion_usability",
    ] as const;

    const values = diagnosticNames.map((column, position) =>
      readDiagnostic(rest[position] ?? "", where, column),
    );
    const filled = values.filter((value) => value !== null);

    if (filled.length > 0 && filled.length < values.length) {
      throw new Error(`${where}: fill all five diagnostic dimensions or none of them`);
    }

    return shotScoreSchema.parse({
      code,
      raterId,
      publishable: readPublishable(publishable, where),
      diagnostics:
        filled.length === 0
          ? null
          : {
              characterIdentity: values[0],
              wardrobe: values[1],
              artStyle: values[2],
              sceneContinuity: values[3],
              motionUsability: values[4],
            },
      notes: rest[5] ?? "",
    });
  });
}

/** A blank scorecard, one row per sample, in the packet's shuffled order. */
export function renderShotScoreCsv(codes: readonly string[], raterId: string): string {
  const rows = codes.map((code) => [code, raterId, "", "", "", "", "", "", ""].join(","));

  return `${[shotScoreHeader.join(","), ...rows].join("\n")}\n`;
}

export const sequenceScoreHeader = ["rater_id", "willing_to_publish", "notes"] as const;

/**
 * Gate D's one question, one row per rater.
 *
 * A blank verdict is refused rather than read as a no: §4 says D has to be asked
 * directly, and a rater who did not answer has not been asked.
 */
export function parseSequenceScoreCsv(text: string): SequenceScore[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const header = lines.shift();
  if (header === undefined) throw new Error("the sequence scorecard is empty");

  const columns = splitCsvLine(header).map((name) => name.toLowerCase());
  if (columns.join(",") !== sequenceScoreHeader.join(",")) {
    throw new Error(
      `unexpected sequence scorecard header.\n  expected: ${sequenceScoreHeader.join(",")}\n  found:    ${columns.join(",")}`,
    );
  }

  const seen = new Set<string>();

  return lines.map((line, index) => {
    const where = `row ${index + 2}`;
    const cells = splitCsvLine(line);

    if (cells.length !== sequenceScoreHeader.length) {
      throw new Error(
        `${where}: expected ${sequenceScoreHeader.length} columns, found ${cells.length}`,
      );
    }

    const [raterId, verdict, notes] = cells as [string, string, string];

    if (seen.has(raterId)) throw new Error(`${where}: ${raterId} answered twice`);
    seen.add(raterId);

    return sequenceScoreSchema.parse({
      raterId,
      willingToPublish: readPublishable(verdict, where),
      notes,
    });
  });
}

export function renderSequenceScoreCsv(raterIds: readonly string[]): string {
  const rows = raterIds.map((raterId) => [raterId, "", ""].join(","));

  return `${[sequenceScoreHeader.join(","), ...rows].join("\n")}\n`;
}
