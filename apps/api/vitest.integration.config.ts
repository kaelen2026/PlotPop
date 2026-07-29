import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/**
 * Integration tests run the real route tree against the real Postgres from
 * `docker/compose.yaml`. `.claude/rules/tdd.md` §6 keeps the database unmocked:
 * workspace isolation and idempotency are enforced by constraints, so a fake
 * would be testing the fake.
 */
export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      include: ["**/*.integration.test.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
