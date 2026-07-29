import { type HealthResponse } from "@plotpop/contracts";
import { Hono } from "hono";

const liveness: HealthResponse = { status: "ok", service: "api" };

// Routes are chained so `AppType` carries the full route tree for the RPC
// client (docs/ai-comic-drama-saas-design.md §21).
export const app = new Hono().get("/health", (c) => c.json(liveness, 200));

export type AppType = typeof app;
