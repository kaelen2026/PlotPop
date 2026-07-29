import type { HealthResponse, ReadinessResponse } from "@plotpop/contracts";
import { healthResponseSchema, readinessResponseSchema } from "@plotpop/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createApiClient } from "./index.js";

const liveness: HealthResponse = { status: "ok", service: "api" };

const readiness: ReadinessResponse = {
  status: "degraded",
  service: "api",
  dependencies: [{ name: "database", status: "down" }],
};

/** Records the urls the client asks for and answers with a canned payload. */
function recordingFetch(body: unknown, status = 200) {
  const urls: string[] = [];

  return {
    urls,
    fetch: (input: Parameters<typeof globalThis.fetch>[0]) => {
      urls.push(String(input instanceof Request ? input.url : input));

      return Promise.resolve(Response.json(body, { status }));
    },
  };
}

describe("api client", () => {
  it("calls the liveness route on the configured origin", async () => {
    const { urls, fetch } = recordingFetch(liveness);

    const response = await createApiClient("https://api.plotpop.test", { fetch }).health.$get();

    expect(urls).toEqual(["https://api.plotpop.test/health"]);
    expect(healthResponseSchema.parse(await response.json())).toEqual(liveness);
  });

  it("joins the path cleanly onto a base url that ends in a slash", async () => {
    const { urls, fetch } = recordingFetch(liveness);

    await createApiClient("https://api.plotpop.test/", { fetch }).health.$get();

    expect(urls).toEqual(["https://api.plotpop.test/health"]);
  });

  it("surfaces the status the api chose rather than throwing on 503", async () => {
    const { fetch } = recordingFetch(readiness, 503);

    const response = await createApiClient("https://api.plotpop.test", { fetch }).ready.$get();

    expect(response.status).toBe(503);
    expect(readinessResponseSchema.parse(await response.json())).toEqual(readiness);
  });

  // The point of the package: consumers get a type that is already resolved.
  // If the api's route tree stopped reaching the client, this fails at typecheck.
  it("infers each route's payload from the api's own route tree", async () => {
    const client = createApiClient("https://api.plotpop.test");

    expectTypeOf(client.health.$get).returns.resolves.toHaveProperty("json");
    expectTypeOf<
      Awaited<ReturnType<Awaited<ReturnType<typeof client.health.$get>>["json"]>>
    >().toEqualTypeOf<HealthResponse>();
    expectTypeOf<
      Awaited<ReturnType<Awaited<ReturnType<typeof client.ready.$get>>["json"]>>
    >().toEqualTypeOf<ReadinessResponse>();
  });
});
