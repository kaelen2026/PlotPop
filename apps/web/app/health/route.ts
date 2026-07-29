import type { HealthResponse } from "@plotpop/contracts";

const liveness: HealthResponse = { status: "ok", service: "web" };

export function GET(): Response {
  return Response.json(liveness);
}
