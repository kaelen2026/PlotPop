import type { AddressInfo } from "node:net";
import { healthResponseSchema } from "@plotpop/contracts";
import { describe, expect, it } from "vitest";
import { createHealthServer } from "./health-server.js";

describe("worker liveness", () => {
  it("answers the liveness probe with the worker service identity", async () => {
    const server = createHealthServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      expect(response.status).toBe(200);
      expect(healthResponseSchema.parse(await response.json())).toEqual({
        status: "ok",
        service: "worker",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
