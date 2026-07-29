/**
 * The browser APIs the theme switcher reads. Every page under `AppShell` renders
 * it, so any page test needs these; jsdom implements neither.
 */
export function stubBrowserEnvironment(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}
