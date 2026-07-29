import { healthResponseSchema } from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("api liveness", () => {
  it("answers the liveness probe with the api service identity", async () => {
    const response = await testClient(app).health.$get();

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: "ok",
      service: "api",
    });
  });
});
