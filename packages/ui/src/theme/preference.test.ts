import { describe, expect, it } from "vitest";
import {
  readThemePreference,
  resolveTheme,
  type ThemePreference,
  themePreferenceSchema,
} from "./preference";

describe("theme preference", () => {
  it("accepts only the three documented preferences", () => {
    // §5.1: the theme is `system | light | dark`. A fourth value would leak a
    // state the switcher and the first paint script cannot represent.
    expect(themePreferenceSchema.options).toEqual(["system", "light", "dark"]);
    expect(themePreferenceSchema.safeParse("auto").success).toBe(false);
  });

  it("follows the operating system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the operating system when the preference is explicit", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to system when nothing is stored", () => {
    expect(readThemePreference(null)).toBe("system");
  });

  it("falls back to system when the stored value is not a preference", () => {
    // A stale or hand edited value must not leave the page without a theme.
    expect(readThemePreference("solarized")).toBe("system");
    expect(readThemePreference("")).toBe("system");
  });

  it("returns the stored preference when it is valid", () => {
    const preferences: ThemePreference[] = ["system", "light", "dark"];
    for (const preference of preferences) {
      expect(readThemePreference(preference)).toBe(preference);
    }
  });
});
