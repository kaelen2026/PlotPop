import type { HealthResponse } from "@plotpop/contracts";
import type { ReadinessReporter } from "@plotpop/observability";
import { Hono } from "hono";

const liveness: HealthResponse = { status: "ok", service: "api" };

export type AppDependencies = {
  readonly readiness: ReadinessReporter;
};

/**
 * Routes are chained so `AppType` carries the full route tree for the RPC client
 * (docs/ai-comic-drama-saas-design.md §21), and every response states its status
 * explicitly so the client infers a usable union.
 */
export function createApp({ readiness }: AppDependencies) {
  return new Hono()
    .get("/health", (c) => c.json(liveness, 200))
    .get("/ready", async (c) => {
      const report = await readiness();

      return c.json(report, report.status === "ready" ? 200 : 503);
    });
}

export type AppType = ReturnType<typeof createApp>;
