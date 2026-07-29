import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { createReadinessReporter, tcpProbe } from "./readiness.js";

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

describe("tcp probe", () => {
  it("resolves against a listening port and rejects once it closes", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const probe = tcpProbe("database", `postgresql://plotpop@127.0.0.1:${port}/plotpop`);

    const whileListening = await createReadinessReporter({
      service: "api",
      dependencies: [probe],
    })();
    expect(whileListening.status).toBe("ready");

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    const afterClose = await createReadinessReporter({
      service: "api",
      dependencies: [probe],
    })();
    expect(afterClose.status).toBe("degraded");
  });

  it("derives the port from the scheme when the url omits it", () => {
    expect(tcpProbe("database", "postgresql://plotpop@db/plotpop").address).toEqual({
      host: "db",
      port: 5432,
    });
    expect(tcpProbe("redis", "redis://cache").address).toEqual({ host: "cache", port: 6379 });
    expect(tcpProbe("storage", "https://storage.example.com").address).toEqual({
      host: "storage.example.com",
      port: 443,
    });
  });

  it("refuses a target whose scheme has no known port", () => {
    expect(() => tcpProbe("mystery", "unknown://somewhere")).toThrow(/unknown:/);
  });
});
