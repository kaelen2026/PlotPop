import { expect, test } from "@playwright/test";

/**
 * Liveness for the deployed Web surface.
 *
 * `CLAUDE.md` keeps `/health` free of dependency checks: it reports whether the
 * process itself is alive and must answer 200 even when everything behind it is
 * down. This spec is what makes the Playwright web server's readiness wait
 * meaningful — if the route stopped answering, every other gate would fail as an
 * unexplained start-up timeout instead of as a broken route.
 *
 * The response shape is owned by `HealthResponse` in `packages/contracts` and is
 * type checked at the route; here it is asserted the way a load balancer sees it.
 */
test("the web service reports itself alive", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", service: "web" });
});
