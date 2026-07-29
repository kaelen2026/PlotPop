import type { AuthService } from "@plotpop/auth";
import type { HealthResponse } from "@plotpop/contracts";
import type { Database } from "@plotpop/db";
import type { ReadinessReporter } from "@plotpop/observability";
import { Hono } from "hono";
import { createWorkspaceRoutes } from "./routes/workspaces.js";

const liveness: HealthResponse = { status: "ok", service: "api" };

export type AppDependencies = {
  readonly readiness: ReadinessReporter;
  readonly auth: AuthService;
  readonly db: Database;
};

/**
 * Routes are chained so `AppType` carries the full route tree for the RPC client
 * (docs/ai-comic-drama-saas-design.md §21), and every response states its status
 * explicitly so the client infers a usable union.
 */
export function createApp({ readiness, auth, db }: AppDependencies) {
  return (
    new Hono()
      .get("/health", (c) => c.json(liveness, 200))
      .get("/ready", async (c) => {
        const report = await readiness();

        return c.json(report, report.status === "ready" ? 200 : 503);
      })
      /*
       * Better Auth owns `/api/auth/*` end to end (ADR-007). The raw request is
       * forwarded rather than rebuilt, so cookie attributes, origin checks and
       * error shapes stay the library's and the web tier can use its client
       * without a second session implementation on our side.
       *
       * Deliberately outside `/api/v1`: these are not versioned business routes,
       * and they are not part of the RPC surface.
       */
      .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
      // Versioned business routes (§18.2). Everything under here needs a session.
      .route("/api/v1/workspaces", createWorkspaceRoutes({ db, auth }))
  );
}

export type AppType = ReturnType<typeof createApp>;
