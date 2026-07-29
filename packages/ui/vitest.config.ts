import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/**
 * Component tests need the `jest-dom` matchers. Files that touch the DOM opt into
 * jsdom with a `@vitest-environment` docblock, so the token tests keep running in
 * plain Node.
 */
export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
