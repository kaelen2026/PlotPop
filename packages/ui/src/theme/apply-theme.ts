import {
  type ResolvedTheme,
  readThemePreference,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_PREFERENCE_ATTRIBUTE,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./preference";

/**
 * The switcher's side of the theme state that `theme-script.ts` establishes
 * before the first paint.
 *
 * Both write the resolved theme and the preference, because §5.1 requires the
 * switcher to keep showing `system` as selected while the document carries a
 * resolved `light` or `dark`.
 */
export function applyThemePreference(
  root: HTMLElement,
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  const theme = resolveTheme(preference, systemPrefersDark);
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.setAttribute(THEME_PREFERENCE_ATTRIBUTE, preference);
  root.style.colorScheme = theme;
  return theme;
}

/** Reads the preference the first paint script left on the document. */
export function currentThemePreference(root: HTMLElement): ThemePreference {
  return readThemePreference(root.getAttribute(THEME_PREFERENCE_ATTRIBUTE));
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked storage must not turn a theme click into an unhandled error. The
    // choice applies to this document, and the next visit starts from the
    // operating system preference again.
    return;
  }
}
