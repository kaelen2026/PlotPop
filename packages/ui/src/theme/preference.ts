import { z } from "zod";

/**
 * Theme state, per `docs/design-system.md` §5.1.
 *
 * The preference and the resolved theme are separate values on purpose: the
 * document always carries a resolved `light` or `dark`, while the switcher has to
 * keep showing `system` as the selected option.
 */

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const resolvedThemeSchema = z.enum(["light", "dark"]);
export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;

/** Local storage key for visitors without an account preference yet (§5.1). */
export const THEME_STORAGE_KEY = "plotpop.theme";

export const THEME_ATTRIBUTE = "data-theme";
export const THEME_PREFERENCE_ATTRIBUTE = "data-theme-preference";
export const DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference !== "system") return preference;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * A stored value that is stale or hand edited must not leave the document
 * without a theme, which would render every token unset.
 */
export function readThemePreference(stored: string | null): ThemePreference {
  const parsed = themePreferenceSchema.safeParse(stored);
  return parsed.success ? parsed.data : "system";
}
