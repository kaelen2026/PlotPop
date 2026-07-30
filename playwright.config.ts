import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { API_ORIGIN, API_PORT, WEB_ORIGIN, WEB_PORT } from "./e2e/support/servers";

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
 *
 * Two servers, not one: the gates run against a real api over a real database, so
 * the journey a person takes — browser to its own origin, Next forwarding `/api/*`,
 * Better Auth setting a first-party cookie — is the journey under test rather than
 * a configuration nobody exercises until production. `pnpm test:e2e` therefore
 * needs PostgreSQL: start it with `pnpm docker:up`.
 */

const baseURL = WEB_ORIGIN;

/*
 * The api is served from its build output, and `node dist/index.js` reads no env
 * file of its own, so its database url, session secret and storage credentials
 * have to be in this process's environment before the server starts. The
 * repository root `.env` is the file `pnpm dev` and the api's own scripts read
 * (`CLAUDE.md`), and CI writes one from `.env.example`.
 *
 * `loadEnvFile` leaves an already-set variable alone, which is what lets a shell
 * or a CI job override any of it — and what makes the per-server `env` blocks
 * below authoritative for the handful of values these gates need to differ.
 */
const rootEnvFile = resolve(process.cwd(), ".env");

if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

/*
 * Never reuse a server that is already listening, not even locally.
 *
 * Next bakes the rewrite destination into the build (`routes-manifest.json`), so a
 * server left over from another run or another branch may proxy `/api/*` at an api
 * that is not the one these gates started — which arrives as an authentication
 * failure rather than as a configuration mistake. Refusing to reuse turns that
 * into Playwright saying the port is occupied, which is a sentence you can act on.
 */
const REUSE_EXISTING_SERVER = false;

/** `docs/design-system.md` §8.2: Large (`xl:`) and Small (default) tiers. */
const desktopViewport = { width: 1440, height: 900 };
const smallViewport = { width: 390, height: 844 };

/**
 * Specs whose subject is not the layout. Everything else runs at both tiers, so
 * a new UI slice gets Small screen coverage without having to remember to ask.
 */
const viewportIndependentSpecs = ["**/health.spec.ts", "**/theme.spec.ts"];

/**
 * Visual regression runs in its own projects, and only when asked for by name:
 * `pnpm test:e2e` covers behaviour and accessibility on any machine, while
 * `pnpm test:e2e:visual` compares pixels inside the pinned Playwright container.
 * A baseline is only valid for the renderer that produced it, and the container
 * is the one renderer this repository keeps baselines for.
 */
const visualSpecs = ["**/visual.spec.ts"];

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
    toHaveScreenshot: {
      // Font rasterisation still moves by a pixel or two between Chromium builds
      // inside the same image. A ratio this small absorbs that and nothing else:
      // a changed colour, radius or spacing is thousands of pixels.
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  // Flat, because the platform suffix carries the only distinction that matters:
  // a baseline belongs to exactly one renderer. Only the Linux set is committed;
  // see `.gitignore` and `.claude/rules/tdd.md` §5.
  snapshotPathTemplate: "e2e/__screenshots__/{arg}-{projectName}-{platform}{ext}",

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
      testIgnore: visualSpecs,
    },
    {
      name: "small",
      use: { ...devices["Desktop Chrome"], viewport: smallViewport, deviceScaleFactor: 1 },
      testIgnore: [...visualSpecs, ...viewportIndependentSpecs],
    },
    {
      name: "visual-desktop",
      use: { ...devices["Desktop Chrome"], viewport: desktopViewport, deviceScaleFactor: 1 },
      testMatch: visualSpecs,
    },
    {
      name: "visual-small",
      use: { ...devices["Desktop Chrome"], viewport: smallViewport, deviceScaleFactor: 1 },
      testMatch: visualSpecs,
    },
  ],

  /*
   * Started in order, api first: Playwright awaits each entry before the next, and
   * the web build has nothing to gain from racing the api's.
   */
  webServer: [
    {
      command: `pnpm exec turbo run build --filter=@plotpop/api && pnpm --filter @plotpop/api start`,
      /*
       * Liveness, not readiness. `/ready` probes Redis and object storage, which
       * no gate needs and the browser job does not start, so waiting on it would
       * report a working api as a start-up timeout. `CLAUDE.md` keeps `/health`
       * free of dependency checks precisely so it can answer this question.
       */
      url: `${API_ORIGIN}/health`,
      env: {
        /*
         * Not `production`: `packages/config` refuses to trust a loopback origin
         * in production, and a Secure cookie over plain http is dropped by the
         * browser — which would look like a broken login rather than a
         * misconfigured gate.
         */
        NODE_ENV: "test",
        API_PORT: String(API_PORT),
        // Better Auth checks the origin the browser presents (ADR-007), and here
        // that is the Playwright web server rather than the development one.
        AUTH_BASE_URL: WEB_ORIGIN,
        AUTH_TRUSTED_ORIGINS: WEB_ORIGIN,
      },
      reuseExistingServer: REUSE_EXISTING_SERVER,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // A production build, not `next dev`: §5.2 is about what the browser paints
      // first, and the development server injects its own scripts ahead of the
      // document. Turborepo caches the build, so a repeated local run pays for the
      // server start only.
      command: `pnpm exec turbo run build --filter=@plotpop/web && pnpm --filter @plotpop/web start --port ${WEB_PORT}`,
      // Waits on the liveness route rather than the page, so a server that boots
      // but cannot render is still reported as a failing test instead of a timeout.
      url: `${baseURL}/health`,
      env: {
        NODE_ENV: "production",
        // The rewrite target (ADR-007). Without this the gates would proxy to
        // whatever `.env` points at, which is the api a developer is running.
        API_BASE_URL: API_ORIGIN,
      },
      reuseExistingServer: REUSE_EXISTING_SERVER,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
