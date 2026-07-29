import { healthResponseSchema } from "@plotpop/contracts";
import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("web liveness", () => {
  it("answers the liveness probe with the web service identity", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: "ok",
      service: "web",
    });
  });
});
