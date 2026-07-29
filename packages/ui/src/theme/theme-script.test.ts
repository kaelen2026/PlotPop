// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from "./preference.js";
import { THEME_INIT_SCRIPT } from "./theme-script.js";

/**
 * `docs/design-system.md` §5.2 forbids rendering Light and then switching to
 * Dark, so the theme has to be on the root element before the first paint. That
 * rules out React: only a blocking inline script runs early enough. This suite
 * executes the very string that is inlined into the document head.
 */

type ScriptEnvironment = {
  stored?: string | null;
  storageThrows?: boolean;
  prefersDark: boolean;
};

function execute(options: ScriptEnvironment): void {
  const stored = options.stored ?? null;

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (options.storageThrows === true) throw new Error("storage is blocked");
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    },
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: query.includes("dark") && options.prefersDark }),
  });

  new Function(THEME_INIT_SCRIPT)();
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-preference");
  document.documentElement.style.removeProperty("color-scheme");
});

describe("first paint theme script", () => {
  it("resolves the theme the same way the switcher does", () => {
    const preferences: ThemePreference[] = ["system", "light", "dark"];
    for (const preference of preferences) {
      for (const prefersDark of [true, false]) {
        execute({ stored: preference, prefersDark });
        expect(document.documentElement.dataset.theme).toBe(resolveTheme(preference, prefersDark));
      }
    }
  });

  it("records the preference separately from the resolved theme", () => {
    // The switcher has to show `system` as selected even though the document
    // carries a resolved `light` or `dark` (§5.2).
    execute({ stored: "system", prefersDark: true });
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("tells the browser which scheme native controls should use", () => {
    execute({ stored: "dark", prefersDark: false });
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("still applies a theme when storage is unavailable", () => {
    // Blocked storage in private browsing must not throw and leave the page
    // without a theme, which would render every token unset.
    expect(() => execute({ storageThrows: true, prefersDark: true })).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });

  it("falls back to system for an unusable stored value", () => {
    execute({ stored: "solarized", prefersDark: true });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });
});
