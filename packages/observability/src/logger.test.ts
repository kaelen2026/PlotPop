import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

function recordingLogger(level?: "debug" | "info" | "warn" | "error") {
  const lines: string[] = [];
  const logger = createLogger({
    service: "api",
    ...(level ? { level } : {}),
    sink: (line) => lines.push(line),
    now: () => new Date("2026-07-29T10:00:00.000Z"),
  });

  return { logger, lines, records: () => lines.map((line) => JSON.parse(line)) };
}

describe("structured logger", () => {
  it("writes one newline-terminated json object per record", () => {
    const { logger, lines, records } = recordingLogger();

    logger.info("listening", { port: 3001 });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith("\n")).toBe(true);
    expect(records()[0]).toEqual({
      time: "2026-07-29T10:00:00.000Z",
      level: "info",
      service: "api",
      message: "listening",
      port: 3001,
    });
  });

  it("drops records below the configured level", () => {
    const { logger, records } = recordingLogger("warn");

    logger.debug("noisy");
    logger.info("routine");
    logger.warn("degraded");
    logger.error("broken");

    expect(records().map((record) => record.level)).toEqual(["warn", "error"]);
  });

  it("serialises an error into a readable shape instead of an empty object", () => {
    const { logger, records } = recordingLogger();

    logger.error("provider call failed", { error: new TypeError("boom") });

    expect(records()[0]?.error).toMatchObject({ name: "TypeError", message: "boom" });
    expect(records()[0]?.error.stack).toContain("boom");
  });

  it("keeps a multi-line stack on a single log line", () => {
    const { logger, lines } = recordingLogger();

    logger.error("failed", { error: new Error("multi\nline") });

    expect(lines[0]?.trimEnd().includes("\n")).toBe(false);
  });

  // The parsed configuration holds database passwords and storage keys. A log
  // call is the easiest way to move one into a log aggregator by accident.
  it("redacts values whose key names a credential", () => {
    const { logger, records } = recordingLogger();

    logger.info("configured", {
      storage: { bucket: "plotpop-local", secretAccessKey: "storage-secret" },
      databasePassword: "db-secret",
      idempotencyKey: "run-42",
    });

    expect(records()[0]).toMatchObject({
      storage: { bucket: "plotpop-local", secretAccessKey: "[redacted]" },
      databasePassword: "[redacted]",
      idempotencyKey: "run-42",
    });
  });

  // Log records are read by humans during an incident and by queries afterwards.
  // A field must not be able to rewrite which service or level a record claims.
  it("refuses to let a field impersonate the record envelope", () => {
    const { logger, records } = recordingLogger();

    logger.info("suspicious", { service: "worker", level: "debug", message: "other" });

    expect(records()[0]).toMatchObject({ service: "api", level: "info", message: "suspicious" });
  });

  it("survives a self-referential field rather than throwing inside the log call", () => {
    const { logger, records } = recordingLogger();
    const cyclic: Record<string, unknown> = { name: "run" };
    cyclic.self = cyclic;

    expect(() => logger.info("cyclic", { run: cyclic })).not.toThrow();
    expect(records()[0]?.run).toEqual({ name: "run", self: "[circular]" });
  });

  it("binds child fields onto every record it writes", () => {
    const { logger, records } = recordingLogger();

    const child = logger.child({ runId: "run-42" });
    child.info("queued");
    logger.info("unrelated");

    expect(records()[0]).toMatchObject({ runId: "run-42", message: "queued" });
    expect(records()[1]?.runId).toBeUndefined();
  });

  it("lets a call override a bound field", () => {
    const { logger, records } = recordingLogger();

    logger.child({ attempt: 1 }).warn("retrying", { attempt: 2 });

    expect(records()[0]?.attempt).toBe(2);
  });
});
