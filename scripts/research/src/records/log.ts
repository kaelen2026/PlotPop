import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type AttemptRecord, attemptRecordSchema } from "./attempt.js";

/**
 * The run log: one JSON object per line, appended, never rewritten.
 *
 * Append-only for the same reason the credit ledger is (ADR-004): each line
 * records money that was spent, and a run that crashes at shot 19 must still be
 * able to prove what the first 18 cost. JSONL because a crash mid-write loses at
 * most the last line, where a single JSON array would lose the file.
 *
 * A line that cannot be read is an error naming its line number. Skipping it would
 * quietly drop a paid generation out of every percentile computed afterwards.
 */

export const attemptLogFileName = "attempts.jsonl";

export type AttemptLog = {
  readonly path: string;
  append(record: AttemptRecord): Promise<void>;
  all(): Promise<AttemptRecord[]>;
};

export async function openAttemptLog(directory: string): Promise<AttemptLog> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, attemptLogFileName);

  return {
    path,

    async append(record) {
      // Validated on the way out as well as on the way in: the schema is the only
      // description of a record, and a log line that does not satisfy it is
      // unreadable evidence.
      await appendFile(path, `${JSON.stringify(attemptRecordSchema.parse(record))}\n`, "utf8");
    },

    async all() {
      const raw = await readFile(path, "utf8").catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
        throw error;
      });

      return raw
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter((entry) => entry.line.trim().length > 0)
        .map((entry) => {
          try {
            return attemptRecordSchema.parse(JSON.parse(entry.line));
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`${path} line ${entry.number} is not a readable attempt: ${reason}`);
          }
        });
    },
  };
}

/** Shots that reached a usable version, and so need no further attempts. */
export function succeededShotIds(records: readonly AttemptRecord[]): Set<string> {
  return new Set(
    records.filter((record) => record.outcome === "succeeded").map((record) => record.shotId),
  );
}

/**
 * The next attempt number for a shot, continuing where the log left off.
 *
 * Restarting at 1 after a resume would reuse an idempotency key and overwrite the
 * evidence of an attempt that already cost money — and it would understate the
 * retry count that Gate A and Gate B are counted from.
 */
export function nextAttemptNumber(records: readonly AttemptRecord[], shotId: string): number {
  const highest = records
    .filter((record) => record.shotId === shotId)
    .reduce((maximum, record) => Math.max(maximum, record.attemptNumber), 0);

  return highest + 1;
}
