import type { ReadinessResponse } from "@plotpop/contracts";
import { healthResponseSchema, readinessResponseSchema } from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

function appWith(readiness: ReadinessResponse) {
  return createApp({ readiness: async () => readiness });
}

const ready: ReadinessResponse = {
  status: "ready",
  service: "api",
  dependencies: [
    { name: "database", status: "up" },
    { name: "redis", status: "up" },
  ],
};

describe("api liveness", () => {
  it("answers the liveness probe with the api service identity", async () => {
    const response = await testClient(appWith(ready)).health.$get();

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: "ok",
      service: "api",
    });
  });

  // Liveness must not consult dependencies: a restart cannot fix an unreachable
  // database, so an orchestrator acting on this signal would only add downtime
  // to an outage.
  it("stays ok while a dependency is unreachable", async () => {
    const degraded = appWith({
      status: "degraded",
      service: "api",
      dependencies: [{ name: "database", status: "down" }],
    });

    expect((await testClient(degraded).health.$get()).status).toBe(200);
  });
});

describe("api readiness", () => {
  it("reports 200 and the dependency roll-call when every dependency answers", async () => {
    const response = await testClient(appWith(ready)).ready.$get();

    expect(response.status).toBe(200);
    expect(readinessResponseSchema.parse(await response.json())).toEqual(ready);
  });

  it("reports 503 so a load balancer stops sending traffic to a degraded instance", async () => {
    const report: ReadinessResponse = {
      status: "degraded",
      service: "api",
      dependencies: [
        { name: "database", status: "down" },
        { name: "redis", status: "up" },
      ],
    };

    const response = await testClient(appWith(report)).ready.$get();

    expect(response.status).toBe(503);
    expect(readinessResponseSchema.parse(await response.json())).toEqual(report);
  });
});
