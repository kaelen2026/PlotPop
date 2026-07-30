import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createSeriesThroughApi } from "./support/library";
import { signUpThroughApi, testAccount } from "./support/session";
import { seedThemePreference, THEME_ATTRIBUTE, themeOption, themeSwitcher } from "./support/theme";

/**
 * The accessibility gate for `docs/design-system.md` §15, which `§18` requires CI
 * to run on the key pages, and `.claude/rules/tdd.md` §5 assigns to Playwright.
 *
 * This runs at both viewport tiers (`playwright.config.ts`), because a control
 * that is reachable on a 1440px canvas can still be unreachable once the layout
 * collapses.
 *
 * Only the WCAG rule sets are enabled. axe's "best practice" rules would fail the
 * gate on advice this project has not adopted, and a gate that has to be argued
 * with stops being a gate.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Every page that exists, audited in both themes at both tiers. §18 says "key
 * pages", and while the product is this small that is all of them — a list that
 * has to be remembered is a list that goes stale.
 *
 * A page behind a session says so, and gets a real account rather than an injected
 * cookie: a page that redirects to sign in would otherwise be audited as the sign-in
 * page and pass while nobody was looking at it.
 */
const PAGES = [
  { name: "the landing page", path: "/" },
  { name: "the sign-in page", path: "/sign-in" },
  { name: "the sign-up page", path: "/sign-up" },
  { name: "Creator Home", path: "/home" },
  { name: "the series library", path: "/series", session: true },
  {
    name: "a series' cast",
    session: true,
    // A path that only exists once a series does, so this entry builds one first.
    path: async (page: Page) => `/series/${await createSeriesThroughApi(page, "Audited Series")}`,
  },
  { name: "the creation wizard", path: "/episodes/new" },
  { name: "the Episode Studio", path: "/episodes/prototype-3" },
] as const;

async function auditWcag(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  // Mapped rather than asserted raw: an axe violation object is several hundred
  // lines of DOM, and the rule id plus the offending selectors are what tells you
  // what to fix.
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));

  expect(violations).toEqual([]);
}

test.describe("every page passes an automated WCAG audit", () => {
  for (const entry of PAGES) {
    const { name, path } = entry;
    const needsSession = "session" in entry && entry.session;

    for (const theme of ["light", "dark"] as const) {
      test(`${name} in the ${theme} theme`, async ({ page }) => {
        // §6.6 verifies the token pairs; this verifies what the browser actually
        // composited, including any contrast the tokens cannot predict.
        await seedThemePreference(page, theme);
        if (needsSession) await signUpThroughApi(page, testAccount("axe"));

        await page.goto(typeof path === "string" ? path : await path(page));
        // Waits for the main landmark rather than the theme switcher: the Studio
        // has its own top bar (§8.3) and does not carry the shell.
        await expect(page.locator("main")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, theme);

        await auditWcag(page);
      });
    }
  }
});

test.describe("the theme switcher is operable from the keyboard", () => {
  test("takes focus from the keyboard with a visible ring", async ({ page }) => {
    await page.goto("/");
    await expect(themeSwitcher(page)).toBeVisible();

    // Tab from the document, not from a seeded focus: §15 requires the control to
    // be on the keyboard path, not merely focusable in principle.
    await page.keyboard.press("Tab");

    const system = themeOption(page, "system");
    await expect(system).toBeFocused();

    const ring = await system.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });

    // §9.2 owns the ring's width and colour; the gate owns the fact that there is
    // one. `outline` rather than a shadow is what keeps it from being clipped.
    expect(ring.focusVisible).toBe(true);
    expect(ring.outlineStyle).not.toBe("none");
    expect(ring.outlineWidth).toBeGreaterThan(0);
  });

  test("moves between the three options with the arrow keys and commits one", async ({ page }) => {
    await page.goto("/");
    await expect(themeOption(page, "system")).toBeChecked();

    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await expect(themeOption(page, "light")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(themeOption(page, "dark")).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(themeOption(page, "dark")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
  });
});

test("every theme option carries both a label and an icon", async ({ page }) => {
  // §6.8: a state or selection needs at least two channels, so colour alone can
  // never be the difference. Here the two are the text label and the glyph, and
  // the glyph is `aria-hidden` so it does not double the accessible name.
  await page.goto("/");
  await expect(themeSwitcher(page)).toBeVisible();

  const options = await themeSwitcher(page).getByRole("radio").all();
  expect(options).toHaveLength(3);

  for (const option of options) {
    const channels = await option.evaluate((element) => ({
      label: (element.textContent ?? "").trim(),
      icons: element.querySelectorAll("svg[aria-hidden='true']").length,
    }));

    expect(channels.label).not.toBe("");
    expect(channels.icons).toBe(1);
  }
});
