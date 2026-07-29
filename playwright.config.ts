import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the end-to-end, accessibility and visual gates.
 *
 * `docs/implementation-plan.md` §6.1 names the entry point `pnpm test:e2e`, and
 * `.claude/rules/tdd.md` §5 assigns Playwright the E2E, accessibility and visual
 * regression layers. All three run from this one configuration so a UI slice
 * cannot pass "the tests" while skipping a layer.
 *
 * The suite lives outside `apps/web` on purpose: `apps/web/tsconfig.json` pulls
 * in every `.ts` under the app, and Vitest's default `include` matches
 * `*.spec.ts`, so a Playwright file inside a workspace would be compiled by
 * `next build` and executed by `pnpm test`. A repository level `e2e/` directory
 * belongs to no workspace and is also where the journeys that cross Web, API and
 * Worker will go.
 */

/**
 * A dedicated port, not 3000: `pnpm test:e2e` has to be safe to run while
 * `pnpm dev` is up, and `reuseExistingServer` must never pick up a dev server
 * whose build is not the one under test.
 */
const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

/** `docs/design-system.md` §8.2: Large (`xl:`) and Small (default) tiers. */
const desktopViewport = { width: 1440, height: 900 };
const smallViewport = { width: 390, height: 844 };

/**
 * Specs whose subject is not the layout. Everything else runs at both tiers, so
 * a new UI slice gets Small screen coverage without having to remember to ask.
 */
const viewportIndependentSpecs = ["**/health.spec.ts", "**/theme.spec.ts"];

export default defineConfig({
  testDir: "./e2e",

  // Mirrors `tooling/vitest/base.ts`, which pins `allowOnly: false` rather than
  // leaving it to `process.env.CI`: a stray `.only` must fail on the machine that
  // wrote it, not two pushes later.
  forbidOnly: true,

  // No retries anywhere. A theme or accessibility gate that only passes on the
  // second attempt is reporting a real defect, and a green retry hides it.
  retries: 0,

  fullyParallel: true,
  timeout: 30_000,

  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  expect: {
    timeout: 5_000,
  },

  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "UTC",
    // The first paint tests read the operating system preference, so the
    // baseline has to be stated rather than inherited from the host.
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: desktopViewport, deviceScaleFactor: 1 },
    },
    {
      name: "small",
      use: { ...devices["Desktop Chrome"], viewport: smallViewport, deviceScaleFactor: 1 },
      testIgnore: viewportIndependentSpecs,
    },
  ],

  webServer: {
    // A production build, not `next dev`: §5.2 is about what the browser paints
    // first, and the development server injects its own scripts ahead of the
    // document. Turborepo caches the build, so a repeated local run pays for the
    // server start only.
    command: `pnpm exec turbo run build --filter=@plotpop/web && pnpm --filter @plotpop/web start --port ${port}`,
    // Waits on the liveness route rather than the page, so a server that boots
    // but cannot render is still reported as a failing test instead of a timeout.
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
