import {
  DARK_COLOR_SCHEME_QUERY,
  THEME_ATTRIBUTE,
  THEME_PREFERENCE_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "./preference.js";

/**
 * The blocking script that resolves the theme before the first paint.
 *
 * `docs/design-system.md` §5.2 forbids rendering Light and then switching to
 * Dark. React cannot help here — even a server rendered document does not know
 * the operating system preference — so the resolution has to happen in an inline
 * script in the document head, ahead of stylesheets and hydration.
 *
 * The script restates the rule in `resolveTheme` because it cannot import
 * anything. `theme-script.test.ts` executes this string against every
 * preference and system combination and asserts the two agree, so the copies
 * cannot drift apart silently.
 */
export const THEME_INIT_SCRIPT = `(function () {
  var preference = "system";
  try {
    var stored = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    if (stored === "light" || stored === "dark" || stored === "system") {
      preference = stored;
    }
  } catch (error) {
    preference = "system";
  }
  var theme = preference;
  if (preference === "system") {
    theme = window.matchMedia("${DARK_COLOR_SCHEME_QUERY}").matches ? "dark" : "light";
  }
  var root = document.documentElement;
  root.setAttribute("${THEME_ATTRIBUTE}", theme);
  root.setAttribute("${THEME_PREFERENCE_ATTRIBUTE}", preference);
  root.style.colorScheme = theme;
})();`;
