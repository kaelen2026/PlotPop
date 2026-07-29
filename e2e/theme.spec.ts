import { expect, test } from "@playwright/test";
import {
  documentSurvived,
  markDocument,
  paintLog,
  recordPaints,
  seedThemePreference,
  storedThemePreference,
  THEME_ATTRIBUTE,
  THEME_PREFERENCE_ATTRIBUTE,
  themeOption,
  themeSwitcher,
} from "./support/theme";

/**
 * The `system | light | dark` behaviour from `docs/design-system.md` §5.1 and the
 * first paint rule from §5.2.
 *
 * `packages/ui/src/components/theme-switcher.test.tsx` already covers the
 * component in jsdom. What only a browser can answer is what the user's first
 * frame looked like: jsdom neither paints nor runs the blocking script in
 * `<head>`, so the rule that forbids rendering Light and then switching to Dark
 * has no other place to be verified.
 */

test.describe("theme resolution before the first paint", () => {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`with an operating system that prefers ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      test(`paints ${scheme} on the first frame and never repaints the canvas`, async ({
        page,
      }) => {
        await recordPaints(page);
        await page.goto("/");
        // The switcher replaces its skeleton once React has hydrated, so waiting
        // for it puts every client side theme write inside the recording.
        await expect(themeSwitcher(page)).toBeVisible();

        const log = await paintLog(page);

        expect(log.firstFrame).toEqual({
          theme: scheme,
          preference: "system",
          colorScheme: scheme,
        });
        // One colour, so there was no Light frame ahead of the Dark one.
        expect(log.canvasColors).toHaveLength(1);
      });
    });
  }

  test("keeps system selected in the switcher while the document resolves to dark", async ({
    page,
  }) => {
    // §5.2: CSS reads the resolved theme, the switcher reads the preference, so
    // choosing `system` on a dark machine must not move the selection to Dark.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect(themeSwitcher(page)).toBeVisible();
    await expect(themeOption(page, "system")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    await expect(page.locator("html")).toHaveAttribute(THEME_PREFERENCE_ATTRIBUTE, "system");
  });

  test("resolves a stored preference before the first paint, against the operating system", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await seedThemePreference(page, "dark");
    await recordPaints(page);
    await page.goto("/");
    await expect(themeSwitcher(page)).toBeVisible();

    const log = await paintLog(page);

    expect(log.firstFrame).toEqual({
      theme: "dark",
      preference: "dark",
      colorScheme: "dark",
    });
    expect(log.canvasColors).toHaveLength(1);
  });
});

test.describe("choosing a theme", () => {
  test("applies the chosen theme and remembers it without reloading the page", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(themeSwitcher(page)).toBeVisible();
    await markDocument(page);

    await themeOption(page, "dark").click();

    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    await expect(page.locator("html")).toHaveAttribute(THEME_PREFERENCE_ATTRIBUTE, "dark");
    await expect(themeOption(page, "dark")).toBeChecked();
    expect(await storedThemePreference(page)).toBe("dark");
    // §5.1: switching must not reload, because a reload would drop editing state.
    expect(await documentSurvived(page)).toBe(true);
  });

  test("still has the remembered theme before the first paint of the next visit", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await recordPaints(page);
    await page.goto("/");
    await themeOption(page, "dark").click();

    await page.reload();
    await expect(themeSwitcher(page)).toBeVisible();

    const log = await paintLog(page);
    expect(log.firstFrame?.theme).toBe("dark");
    expect(log.canvasColors).toHaveLength(1);
    await expect(themeOption(page, "dark")).toBeChecked();
  });

  test("follows the operating system for as long as system stays selected", async ({ page }) => {
    // §5.1: the follow is live, not a value read once at load.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(themeOption(page, "system")).toBeChecked();
    await markDocument(page);

    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    await expect(themeOption(page, "system")).toBeChecked();
    expect(await documentSurvived(page)).toBe(true);
  });

  test("stops following the operating system once a theme is chosen", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await themeOption(page, "light").click();

    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "light");
  });
});
