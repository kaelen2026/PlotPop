import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/**
 * Integration tests run against the real Postgres from `docker/compose.yaml`.
 *
 * `.claude/rules/tdd.md` §6: Postgres is not a system boundary, so it is not
 * mocked — `NOT NULL`, `UNIQUE`, `CHECK`, foreign keys and transactions are part
 * of what these tests are checking.
 *
 * Files run one at a time: each provisions and drops its own database, and a
 * parallel run would spend more time on connection setup than on assertions.
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
