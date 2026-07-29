import { createServer, type Server, type ServerResponse } from "node:http";
import type { HealthResponse } from "@plotpop/contracts";
import type { ReadinessReporter } from "@plotpop/observability";

const liveness: HealthResponse = { status: "ok", service: "worker" };

export type HealthServerDependencies = {
  readonly readiness: ReadinessReporter;
};

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/**
 * The worker has no public API, so its probes ride on their own tiny HTTP server
 * rather than the Hono router in `apps/api` (ADR-001: the worker depends on no
 * routing code from the other services).
 */
export function createHealthServer({ readiness }: HealthServerDependencies): Server {
  return createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405);
      response.end();
      return;
    }

    if (request.url === "/health") {
      respond(response, 200, liveness);
      return;
    }

    if (request.url === "/ready") {
      // The reporter already turns a probe failure into a `down` dependency, so a
      // rejection here means the reporter itself broke: report not ready.
      readiness().then(
        (report) => respond(response, report.status === "ready" ? 200 : 503, report),
        () => respond(response, 503, { status: "degraded", service: "worker", dependencies: [] }),
      );
      return;
    }

    response.writeHead(404);
    response.end();
  });
}
