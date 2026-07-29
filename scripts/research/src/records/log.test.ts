import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AttemptRecord, attemptRecordSchema, attemptRecordSchemaVersion } from "./attempt.js";
import { attemptLogFileName, nextAttemptNumber, openAttemptLog, succeededShotIds } from "./log.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function runDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "plotpop-f00-"));
  directories.push(path);

  return path;
}

const sha = "b".repeat(64);

function record(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return attemptRecordSchema.parse({
    schemaVersion: attemptRecordSchemaVersion,
    runId: "run-a",
    attemptId: `attempt-${Math.random()}`,
    idempotencyKey: "run-a:generate_shot_video:shot-01:1",
    shotId: "shot-01",
    tier: "standard",
    attemptNumber: 1,
    provider: { id: "example-video", model: "example-video/v1", taskId: null },
    input: {
      renderedPrompt: "Rain falls.",
      promptSha256: sha,
      referenceImagePaths: [],
      parameters: {},
    },
    requestedAt: "2026-07-29T18:00:00.000Z",
    completedAt: "2026-07-29T18:00:10.000Z",
    latencyMs: { submit: 100, generate: 9900, total: 10_000 },
    outcome: "failed",
    failure: {
      failureClass: "provider_unavailable",
      retryDisposition: "retry_with_backoff",
      providerCode: null,
      providerMessage: null,
    },
    usage: null,
    output: null,
    ...overrides,
  });
}

describe("the attempt log", () => {
  it("reads back as empty in a directory that has never been run", async () => {
    const log = await openAttemptLog(await runDirectory());

    expect(await log.all()).toEqual([]);
  });

  it("appends one line per attempt and reads them back in order", async () => {
    const log = await openAttemptLog(await runDirectory());
    const first = record({ shotId: "shot-01" });
    const second = record({ shotId: "shot-02" });

    await log.append(first);
    await log.append(second);

    expect((await log.all()).map((entry) => entry.shotId)).toEqual(["shot-01", "shot-02"]);
    const raw = await readFile(log.path, "utf8");
    expect(raw.trimEnd().split("\n")).toHaveLength(2);
  });

  it("keeps history when the log is reopened, which is what makes a paid run resumable", async () => {
    const directory = await runDirectory();
    const first = await openAttemptLog(directory);
    await first.append(record({ shotId: "shot-03" }));

    const reopened = await openAttemptLog(directory);
    await reopened.append(record({ shotId: "shot-04" }));

    expect((await reopened.all()).map((entry) => entry.shotId)).toEqual(["shot-03", "shot-04"]);
  });

  it("never rewrites an earlier line", async () => {
    const directory = await runDirectory();
    const log = await openAttemptLog(directory);
    await log.append(record({ shotId: "shot-05" }));
    const afterFirst = await readFile(log.path, "utf8");

    await log.append(record({ shotId: "shot-06" }));

    expect(await readFile(log.path, "utf8")).toMatch(
      new RegExp(`^${afterFirst.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  });

  it("names the line it could not read, rather than losing the run silently", async () => {
    const directory = await runDirectory();
    const log = await openAttemptLog(directory);
    await log.append(record());
    await writeFile(join(directory, attemptLogFileName), "{ not json\n", { flag: "a" });

    await expect(log.all()).rejects.toThrow(/line 2/);
  });

  it("rejects a line that parses as json but is not an attempt", async () => {
    const directory = await runDirectory();
    const log = await openAttemptLog(directory);
    await writeFile(join(directory, attemptLogFileName), '{"shotId":"shot-01"}\n', { flag: "a" });

    await expect(log.all()).rejects.toThrow(/line 1/);
  });
});

describe("resume decisions", () => {
  const records = [
    record({ shotId: "shot-01", attemptNumber: 1, outcome: "failed" }),
    record({ shotId: "shot-01", attemptNumber: 2, outcome: "failed" }),
    record({ shotId: "shot-02", attemptNumber: 1, outcome: "cancelled", failure: null }),
  ];

  it("counts a shot as done only when an attempt succeeded", () => {
    expect(succeededShotIds(records)).toEqual(new Set());
  });

  it("counts a succeeded shot as done", () => {
    const done = [
      ...records,
      record({
        shotId: "shot-02",
        attemptNumber: 2,
        outcome: "succeeded",
        failure: null,
        output: {
          path: "shots/shot-02/attempt-2.mp4",
          bytes: 1000,
          sha256: sha,
          media: {
            container: "mp4",
            videoCodec: "h264",
            width: 1280,
            height: 720,
            frameRate: 24,
            durationSeconds: 5,
            bitrateBps: null,
            pixelFormat: null,
            frameCount: null,
            audio: null,
          },
          tierDrift: [],
        },
      }),
    ];

    expect(succeededShotIds(done)).toEqual(new Set(["shot-02"]));
  });

  it("continues the attempt numbering rather than restarting it", () => {
    // Restarting at 1 would reuse an idempotency key and overwrite the evidence
    // of the attempt that already cost money.
    expect(nextAttemptNumber(records, "shot-01")).toBe(3);
  });

  it("starts a shot that has never been tried at one", () => {
    expect(nextAttemptNumber(records, "shot-30")).toBe(1);
  });
});
