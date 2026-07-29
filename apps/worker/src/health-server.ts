import { createServer, type Server } from "node:http";
import type { HealthResponse } from "@plotpop/contracts";

const liveness: HealthResponse = { status: "ok", service: "worker" };

/**
 * The worker has no public API, so liveness rides on its own tiny HTTP server
 * rather than the Hono router in `apps/api` (ADR-001: the worker depends on no
 * routing code from the other services).
 */
export function createHealthServer(): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(liveness));
      return;
    }

    response.writeHead(404);
    response.end();
  });
}
