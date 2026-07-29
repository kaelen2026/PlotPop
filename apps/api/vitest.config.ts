import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/** Integration tests need a database and live behind `test:integration`. */
export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
    },
  }),
);
