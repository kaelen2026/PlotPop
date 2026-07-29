// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "../theme/preference";
import { ThemeSwitcher } from "./theme-switcher";

/**
 * `docs/design-system.md` §5.1 and §5.2. The two rules that shape this component
 * are that switching must not reload the page or reset state, and that the
 * control must never show a wrong selected option before hydration.
 */

const labels = { group: "Theme", system: "System", light: "Light", dark: "Dark" };

const root = document.documentElement;

type MediaListener = (event: MediaQueryListEvent) => void;

function stubEnvironment(options: { prefersDark?: boolean } = {}): {
  entries: Map<string, string>;
  changeSystemPreference: (prefersDark: boolean) => void;
} {
  const entries = new Map<string, string>();
  const listeners = new Set<MediaListener>();
  let prefersDark = options.prefersDark ?? false;

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    },
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return query.includes("dark") && prefersDark;
      },
      addEventListener: (_: string, listener: MediaListener) => listeners.add(listener),
      removeEventListener: (_: string, listener: MediaListener) => listeners.delete(listener),
    }),
  });

  return {
    entries,
    changeSystemPreference: (next: boolean) => {
      prefersDark = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  // Testing Library only auto cleans up when Vitest globals are enabled, and the
  // token tests in this package deliberately run without them.
  cleanup();
  root.removeAttribute("data-theme");
  root.removeAttribute("data-theme-preference");
  root.style.removeProperty("color-scheme");
});

describe("theme switcher", () => {
  it("offers the three documented options with readable labels", () => {
    stubEnvironment();
    render(<ThemeSwitcher labels={labels} />);

    expect(screen.getByRole("radiogroup", { name: labels.group })).toBeInTheDocument();
    for (const label of [labels.system, labels.light, labels.dark]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("shows the preference the first paint script resolved as selected", () => {
    stubEnvironment();
    root.setAttribute("data-theme-preference", "dark");
    render(<ThemeSwitcher labels={labels} />);

    expect(screen.getByRole("radio", { name: labels.dark })).toBeChecked();
    expect(screen.getByRole("radio", { name: labels.system })).not.toBeChecked();
  });

  it("never renders a selected option on the server", () => {
    // §5.2: the server cannot know the preference, so it must not guess. The
    // placeholder holds the space until the client reads the resolved attribute.
    const markup = renderToString(<ThemeSwitcher labels={labels} />);

    expect(markup).not.toContain('aria-checked="true"');
    expect(markup).toContain('data-slot="skeleton"');
  });

  it("applies and remembers the chosen theme without reloading", async () => {
    const { entries } = stubEnvironment();
    root.setAttribute("data-theme-preference", "system");
    render(<ThemeSwitcher labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.dark }));

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themePreference).toBe("dark");
    expect(entries.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: labels.dark })).toBeChecked();
  });

  it("keeps a theme selected when the active option is clicked again", () => {
    // The group must not fall back to an unset theme, which would leave every
    // token unresolved.
    stubEnvironment();
    root.setAttribute("data-theme-preference", "light");
    render(<ThemeSwitcher labels={labels} />);

    const light = screen.getByRole("radio", { name: labels.light });
    light.click();

    expect(screen.getByRole("radio", { name: labels.light })).toBeChecked();
    expect(root.dataset.themePreference).not.toBe("");
  });

  it("follows the operating system while the preference is system", () => {
    // Starts from the state the first paint script leaves behind: preference
    // `system`, resolved `light`. Flipping the operating system has to move the
    // document without the user touching the switcher (§5.1).
    const environment = stubEnvironment({ prefersDark: false });
    root.setAttribute("data-theme-preference", "system");
    root.setAttribute("data-theme", "light");
    render(<ThemeSwitcher labels={labels} />);

    environment.changeSystemPreference(true);

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themePreference).toBe("system");
    expect(screen.getByRole("radio", { name: labels.system })).toBeChecked();
  });

  it("stops following the operating system once a theme is chosen", async () => {
    const environment = stubEnvironment({ prefersDark: false });
    root.setAttribute("data-theme-preference", "system");
    render(<ThemeSwitcher labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.light }));
    environment.changeSystemPreference(true);

    expect(root.dataset.theme).toBe("light");
  });

  it("is reachable and operable from the keyboard", async () => {
    // §15: the switcher is part of the keyboard path, not a mouse only control.
    stubEnvironment();
    root.setAttribute("data-theme-preference", "system");
    render(<ThemeSwitcher labels={labels} />);

    await userEvent.tab();
    expect(screen.getByRole("radio", { name: labels.system })).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: labels.light })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(root.dataset.themePreference).toBe("light");
  });
});
