import { defineConfig, mergeConfig } from "vitest/config";
import { baseTestConfig } from "../../tooling/vitest/base.js";

/**
 * Page and component tests need the `jest-dom` matchers. Files that touch the DOM
 * opt into jsdom with a `@vitest-environment` docblock, so the route handler and
 * design system scan tests keep running in plain Node.
 *
 * Vitest does not read the `@/*` path from `tsconfig.json`, so the alias is
 * repeated here. The two have to move together.
 */
export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
      alias: [{ find: /^@\//, replacement: new URL("./", import.meta.url).pathname }],
    },
    // `tsconfig.json` sets `jsx: preserve` because Next compiles the JSX itself.
    // The test runner has no such downstream step, so it needs the transform.
    oxc: {
      jsx: { runtime: "automatic", importSource: "react" },
    },
  }),
);
