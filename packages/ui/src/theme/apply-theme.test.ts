// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  currentThemePreference,
  persistThemePreference,
} from "./apply-theme";
import { THEME_STORAGE_KEY } from "./preference";

/**
 * The switcher writes the same three pieces of state the first paint script
 * writes (§5.2), so both paths are exercised against the same expectations.
 */

const root = document.documentElement;

function stubStorage(options: { throws?: boolean } = {}): Map<string, string> {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.throws === true) throw new Error("storage is blocked");
        entries.set(key, value);
      },
    },
  });
  return entries;
}

afterEach(() => {
  root.removeAttribute("data-theme");
  root.removeAttribute("data-theme-preference");
  root.style.removeProperty("color-scheme");
  vi.unstubAllGlobals();
});

describe("applying a theme preference", () => {
  it("records the resolved theme and the preference separately", () => {
    applyThemePreference(root, "system", true);

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themePreference).toBe("system");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("ignores the operating system for an explicit preference", () => {
    expect(applyThemePreference(root, "light", true)).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  it("reads back the preference the first paint script left behind", () => {
    applyThemePreference(root, "dark", false);
    expect(currentThemePreference(root)).toBe("dark");
  });

  it("falls back to system when the attribute is missing or unusable", () => {
    expect(currentThemePreference(root)).toBe("system");
    root.setAttribute("data-theme-preference", "solarized");
    expect(currentThemePreference(root)).toBe("system");
  });
});

describe("persisting a theme preference", () => {
  it("stores the choice for the next visit", () => {
    const entries = stubStorage();
    persistThemePreference("dark");
    expect(entries.get(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("keeps working when storage is blocked", () => {
    // Private browsing must not turn a theme click into an unhandled error; the
    // choice simply is not remembered.
    stubStorage({ throws: true });
    expect(() => persistThemePreference("dark")).not.toThrow();
  });
});
