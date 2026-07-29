/**
 * Episode Studio (§8 of the design spec, §13 of the design system).
 */
export const studio = {
  navigator: {
    label: "Scenes and shots",
    sceneLabel: "Scene",
    shotLabel: "Shot",
  },
  preview: {
    label: "Preview",
    empty: "No frame yet for this shot.",
  },
  inspector: {
    label: "Shot inspector",
    line: "Line",
    noLine: "No line in this shot.",
    duration: "Duration",
    status: "Status",
  },
} as const;
