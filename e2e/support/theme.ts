import type { Locator, Page } from "@playwright/test";

/**
 * Helpers for the theme gates.
 *
 * The attribute and storage names are restated here rather than imported from
 * `@plotpop/ui`, because the suite deliberately sits outside every workspace and
 * an end-to-end test should read the document the way a browser does. Drift is
 * self reporting: renaming an attribute in `packages/ui/src/theme/preference.ts`
 * turns these specs red, which is the point of a gate.
 */
export const THEME_ATTRIBUTE = "data-theme";
export const THEME_PREFERENCE_ATTRIBUTE = "data-theme-preference";
export const THEME_STORAGE_KEY = "plotpop.theme";

export type ThemePreference = "system" | "light" | "dark";

/** Copy from `apps/web/locales/en.ts`; §14 keeps it out of the components. */
export const THEME_LABELS = {
  group: "Theme",
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

const PAINT_LOG = "__plotpopPaintLog";
const RELOAD_MARKER = "__plotpopDocumentMarker";

export type PaintLog = {
  /**
   * The document state at the first animation frame. A `requestAnimationFrame`
   * callback runs before the frame it belongs to is painted, so this is what the
   * very first painted frame showed.
   */
  firstFrame: {
    theme: string | null;
    preference: string | null;
    colorScheme: string;
  } | null;
  /**
   * Every distinct Canvas colour the document painted, in order. Two entries mean
   * the user saw one theme and then another, which §5.2 forbids.
   */
  canvasColors: string[];
  /** Frames observed so far, used to wait for a painted document. */
  frames: number;
};

/**
 * Starts recording what the browser paints. Must be called before `page.goto`:
 * init scripts run ahead of the document's own scripts, including the blocking
 * theme script in `<head>`.
 */
export async function recordPaints(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key }) => {
      const log: PaintLog = { firstFrame: null, canvasColors: [], frames: 0 };
      (window as unknown as Record<string, PaintLog>)[key] = log;

      const observe = (): void => {
        log.frames += 1;
        const root = document.documentElement;
        if (log.firstFrame === null) {
          log.firstFrame = {
            theme: root.getAttribute("data-theme"),
            preference: root.getAttribute("data-theme-preference"),
            colorScheme: root.style.colorScheme,
          };
        }

        // The Canvas colour lives on `body` (`packages/ui/src/styles/theme.css`),
        // which may not be parsed yet on the earliest frames.
        if (document.body !== null) {
          const color = window.getComputedStyle(document.body).backgroundColor;
          if (log.canvasColors.at(-1) !== color) log.canvasColors.push(color);
        }

        window.requestAnimationFrame(observe);
      };

      window.requestAnimationFrame(observe);
    },
    { key: PAINT_LOG },
  );
}

/**
 * Reads the recording, once the document has actually painted.
 *
 * `page.goto` resolves on `load`, which can be a frame or two before the browser
 * composites anything, so the wait is for a painted Canvas rather than for a
 * navigation event. A timeout here means the page never painted, which is a
 * failure worth reporting as itself.
 */
export async function paintLog(page: Page): Promise<PaintLog> {
  await page
    .waitForFunction(
      (key) => {
        const log = (window as unknown as Record<string, PaintLog | undefined>)[key];
        return log !== undefined && log.firstFrame !== null && log.canvasColors.length > 0;
      },
      PAINT_LOG,
      { timeout: 5_000 },
    )
    .catch(() => {
      throw new Error(
        "No painted frame was recorded. Call recordPaints() before navigating, and navigate to a page that renders.",
      );
    });

  return await page.evaluate((key) => {
    const log = (window as unknown as Record<string, PaintLog | undefined>)[key];
    if (log === undefined) throw new Error("The recording disappeared after it was observed.");
    return log;
  }, PAINT_LOG);
}

/**
 * Seeds the stored preference of a visitor who has chosen a theme before, so a
 * spec can start from a resolved theme without clicking through the switcher.
 */
export async function seedThemePreference(page: Page, preference: ThemePreference): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: preference },
  );
}

/**
 * Stamps the live document. §5.1 forbids reloading on a theme change, and a
 * value that only exists in this document proves the page survived.
 */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate((key) => {
    (window as unknown as Record<string, boolean>)[key] = true;
  }, RELOAD_MARKER);
}

export async function documentSurvived(page: Page): Promise<boolean> {
  return await page.evaluate(
    (key) => (window as unknown as Record<string, boolean | undefined>)[key] === true,
    RELOAD_MARKER,
  );
}

export function themeSwitcher(page: Page): Locator {
  return page.getByRole("radiogroup", { name: THEME_LABELS.group });
}

export function themeOption(page: Page, preference: ThemePreference): Locator {
  return themeSwitcher(page).getByRole("radio", { name: THEME_LABELS[preference] });
}

export async function storedThemePreference(page: Page): Promise<string | null> {
  return await page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY);
}
