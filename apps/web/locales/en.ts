/**
 * English UI copy. `docs/design-system.md` §14 keeps every visible string out of
 * components, so base components take copy as props and pages read it from here.
 *
 * The first UI is English only; this stays a plain module until a second locale
 * makes a loader worth its weight.
 */
export const messages = {
  theme: {
    group: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
} as const;
