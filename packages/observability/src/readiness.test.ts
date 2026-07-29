import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { createReadinessReporter } from "./readiness.js";

const reachable = (name: string) => ({ name, probe: async () => {} });
const unreachable = (name: string, error: Error) => ({
  name,
  probe: async () => {
    throw error;
  },
});
const hangs = (name: string) => ({
  name,
  probe: () => new Promise<void>(() => {}),
});

describe("readiness reporter", () => {
  it("reports ready when every dependency answers", async () => {
    const report = await createReadinessReporter({
      service: "api",
      dependencies: [reachable("database"), reachable("redis")],
    })();

    expect(report).toEqual({
      status: "ready",
      service: "api",
      dependencies: [
        { name: "database", status: "up" },
        { name: "redis", status: "up" },
      ],
    });
  });

  it("still reports the healthy dependencies when one is down", async () => {
    const report = await createReadinessReporter({
      service: "api",
      dependencies: [unreachable("database", new Error("connection refused")), reachable("redis")],
    })();

    expect(report.status).toBe("degraded");
    expect(report.dependencies).toEqual([
      { name: "database", status: "down" },
      { name: "redis", status: "up" },
    ]);
  });

  it("gives up on a dependency that never answers instead of hanging the probe", async () => {
    const report = await createReadinessReporter({
      service: "worker",
      dependencies: [hangs("redis")],
      timeoutMs: 10,
    })();

    expect(report).toEqual({
      status: "degraded",
      service: "worker",
      dependencies: [{ name: "redis", status: "down" }],
    });
  });

  // A readiness endpoint is reachable by anything that can reach the port. The
  // reason a dependency is down belongs in the logs, where access is controlled.
  it("keeps the failure reason out of the response and puts it in the log", async () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "api", sink: (line) => lines.push(line) });

    const report = await createReadinessReporter({
      service: "api",
      dependencies: [
        unreachable("database", new Error("password authentication failed for user plotpop")),
      ],
      logger,
    })();

    expect(JSON.stringify(report)).not.toContain("password");
    expect(lines.join("")).toContain("password authentication failed");
  });

  it("does not fail the report when a probe rejects with something other than an error", async () => {
    const report = await createReadinessReporter({
      service: "api",
      dependencies: [{ name: "storage", probe: () => Promise.reject("nope") }],
    })();

    expect(report.dependencies).toEqual([{ name: "storage", status: "down" }]);
  });
});
