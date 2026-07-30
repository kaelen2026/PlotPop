import type { AuthService } from "@plotpop/auth";
import type { ReadinessResponse } from "@plotpop/contracts";
import { healthResponseSchema, readinessResponseSchema } from "@plotpop/contracts";
import type { Database } from "@plotpop/db";
import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ObjectStore } from "./object-store.js";

/**
 * Liveness and readiness must answer without a database, so the auth service is a
 * stub here. Its real behaviour is covered by `auth.integration.test.ts` against
 * a real Postgres.
 */
const stubAuth: AuthService = {
  handler: () => Promise.resolve(new Response(null, { status: 501 })),
  getSession: () => Promise.resolve(null),
};

function appWith(readiness: ReadinessResponse) {
  // Liveness and readiness never reach a query, or object storage. Handles that would
  // throw on use are the point: if either route grew a dependency read, these tests
  // would say so rather than reporting the dependency's health as their own.
  const db = {} as Database;
  const store = {} as ObjectStore;

  return createApp({ readiness: async () => readiness, auth: stubAuth, db, store });
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
