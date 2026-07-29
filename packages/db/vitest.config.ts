import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/**
 * The default run stays hermetic. Integration tests need the Postgres from
 * `docker/compose.yaml` and live behind `test:integration`, so a contributor
 * without the stack running still gets a meaningful `pnpm test`.
 */
export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
    },
  }),
);
