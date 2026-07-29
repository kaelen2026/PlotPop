/**
 * English UI copy. `docs/design-system.md` §14 keeps every visible string out of
 * components, so base components take copy as props and pages read it from here.
 *
 * The first UI is English only; this stays a plain module until a second locale
 * makes a loader worth its weight.
 */
export const messages = {
  shell: {
    skipToContent: "Skip to content",
  },
  theme: {
    group: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  creatorHome: {
    title: "Creator Home",
    empty: {
      title: "No episodes yet",
      description:
        "Bring a script and a cast. PlotPop turns them into a 5 to 10 minute episode you can review shot by shot.",
      action: "Create episode",
    },
  },
  landing: {
    openCreatorHome: "Open Creator Home",
  },
} as const;
