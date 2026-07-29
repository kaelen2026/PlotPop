import type { AddressInfo } from "node:net";
import type { ReadinessResponse } from "@plotpop/contracts";
import { healthResponseSchema, readinessResponseSchema } from "@plotpop/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer } from "./health-server.js";

const ready: ReadinessResponse = {
  status: "ready",
  service: "worker",
  dependencies: [{ name: "redis", status: "up" }],
};

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

/** Starts the server on an ephemeral port and returns its base url. */
async function start(readiness: ReadinessResponse): Promise<string> {
  const server = createHealthServer({ readiness: async () => readiness });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("worker liveness", () => {
  it("answers the liveness probe with the worker service identity", async () => {
    const response = await fetch(`${await start(ready)}/health`);

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: "ok",
      service: "worker",
    });
  });
});

describe("worker readiness", () => {
  it("reports the queue transport it consumes from", async () => {
    const response = await fetch(`${await start(ready)}/ready`);

    expect(response.status).toBe(200);
    expect(readinessResponseSchema.parse(await response.json())).toEqual(ready);
  });

  it("reports 503 while a dependency is unreachable", async () => {
    const base = await start({
      status: "degraded",
      service: "worker",
      dependencies: [{ name: "redis", status: "down" }],
    });

    expect((await fetch(`${base}/ready`)).status).toBe(503);
    // Liveness stays ok: restarting the worker cannot reach Redis for it.
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe("worker health server", () => {
  it("answers anything else with 404 instead of leaking a route surface", async () => {
    const response = await fetch(`${await start(ready)}/metrics`);

    expect(response.status).toBe(404);
  });
});
