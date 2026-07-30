import type { AuthService } from "@plotpop/auth";
import type { HealthResponse } from "@plotpop/contracts";
import type { Database } from "@plotpop/db";
import type { ReadinessReporter } from "@plotpop/observability";
import { Hono } from "hono";
import type { ObjectStore } from "./object-store.js";
import { createAssetRoutes } from "./routes/assets.js";
import { createCharacterRoutes } from "./routes/characters.js";
import { createSeriesRoutes } from "./routes/series.js";
import { createWorkspaceRoutes } from "./routes/workspaces.js";

const liveness: HealthResponse = { status: "ok", service: "api" };

export type AppDependencies = {
  readonly readiness: ReadinessReporter;
  readonly auth: AuthService;
  readonly db: Database;
  /** Injected rather than constructed here: `.claude/rules/tdd.md` §6 makes it a boundary. */
  readonly store: ObjectStore;
};

/**
 * Routes are chained so `AppType` carries the full route tree for the RPC client
 * (docs/ai-comic-drama-saas-design.md §21), and every response states its status
 * explicitly so the client infers a usable union.
 */
export function createApp({ readiness, auth, db, store }: AppDependencies) {
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
      /*
       * A workspace's series hang off the workspace that owns them
       * (`/api/v1/workspaces/:workspaceId/series`) rather than a top level
       * `/series`, so no handler can reach one without naming its workspace (§20.1).
       *
       * A second router on the same prefix, because the workspace id is a parameter
       * these handlers have to see typed; `routes/series.ts` says why.
       */
      .route("/api/v1/workspaces", createSeriesRoutes({ db, auth }))
      /*
       * A series' cast hangs off the series that owns it, which hangs off the workspace:
       * `/api/v1/workspaces/:workspaceId/series/:seriesId/characters`. Both ids are in the
       * path because both are checked (§20.1, §32.7).
       */
      .route("/api/v1/workspaces", createCharacterRoutes({ db, auth }))
      /*
       * Assets hang off the workspace that owns them, not off the character that will
       * reference one: §20.4 makes an asset a workspace level record, and the same upload
       * is reusable by more than one thing (§6.1 has voices and a style guide coming).
       */
      .route("/api/v1/workspaces", createAssetRoutes({ db, auth, store }))
  );
}

export type AppType = ReturnType<typeof createApp>;
