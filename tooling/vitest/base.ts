import { defineConfig } from "vitest/config";

/**
 * Shared Vitest settings, mirroring `tooling/typescript/base.json` for tests.
 *
 * `allowOnly` defaults to `!process.env.CI`, so a stray `.only` passes locally
 * and only fails after push — with the rest of the suite silently unrun. Pinning
 * it to false makes the local run behave like CI.
 *
 * Coverage is reported, not enforced: there is no threshold yet because the
 * repository has three tests and any number picked today would be arbitrary.
 */
export const baseTestConfig = defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
