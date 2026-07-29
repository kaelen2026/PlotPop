import { expect, test } from "@playwright/test";
import { seedThemePreference, THEME_ATTRIBUTE, themeSwitcher } from "./support/theme";

/**
 * Light and Dark visual baselines, required by `docs/design-system.md` §18 and
 * assigned to Playwright's `toHaveScreenshot` by `.claude/rules/tdd.md` §5.
 *
 * This layer verifies rather than drives (§4 of the same file): the baseline is
 * produced first and reviewed by eye, then frozen. What it catches is the class
 * of change no assertion is written for — a token edit that quietly moves a
 * surface, a radius, a stroke or a shadow.
 *
 * Baselines are only comparable against the renderer that produced them, so both
 * `pnpm test:e2e:visual` and CI run this file inside the pinned Playwright
 * container and nowhere else.
 */
test.beforeAll(() => {
  if (process.platform !== "linux") {
    throw new Error(
      "Visual baselines belong to the pinned Playwright container. Run `pnpm test:e2e:visual`, which starts it for you.",
    );
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`the web shell in the ${theme} theme`, async ({ page }) => {
    await seedThemePreference(page, theme);
    await page.goto("/");
    // Screenshot after hydration, not before: the switcher's skeleton is a real
    // state but not the one worth freezing.
    await expect(themeSwitcher(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, theme);

    await expect(page).toHaveScreenshot(`web-shell-${theme}.png`, { fullPage: true });
  });
}
