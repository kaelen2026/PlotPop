"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyThemePreference,
  currentThemePreference,
  persistThemePreference,
} from "./apply-theme";
import { DARK_COLOR_SCHEME_QUERY, type ThemePreference } from "./preference";

export type ThemeState = {
  /**
   * `undefined` until the client has read the document. §5.2 forbids showing a
   * wrong selected option, and the server has no way to know the preference, so
   * a caller renders a placeholder rather than guessing.
   */
  preference: ThemePreference | undefined;
  select: (preference: ThemePreference) => void;
};

export function useTheme(): ThemeState {
  const [preference, setPreference] = useState<ThemePreference | undefined>(undefined);

  useEffect(() => {
    setPreference(currentThemePreference(document.documentElement));
  }, []);

  const select = useCallback((next: ThemePreference) => {
    setPreference(next);
    persistThemePreference(next);
    applyThemePreference(
      document.documentElement,
      next,
      window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches,
    );
  }, []);

  useEffect(() => {
    // §5.1: `system` tracks the operating system for as long as it is selected,
    // including while the page stays open.
    if (preference !== "system") return;

    const media = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
    const follow = (event: MediaQueryListEvent): void => {
      applyThemePreference(document.documentElement, "system", event.matches);
    };

    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  return { preference, select };
}
