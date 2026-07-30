/**
 * The series library (`docs/ai-comic-drama-saas-design.md` §5.2, §6.1).
 */
export const series = {
  title: "Series",
  description: "A series holds the cast, the voices and the look your episodes reuse.",
  list: {
    heading: "Your series",
  },
  empty: {
    title: "No series yet",
    description:
      "Start with a series and every episode you make can draw on the same cast and style, instead of describing them again.",
  },
  create: {
    heading: "New series",
    name: {
      label: "Series name",
      description: "You can rename it later.",
      errors: {
        required: "Enter a name for the series.",
        tooLong: "Use 120 characters or fewer.",
      },
    },
    submit: "Create series",
    pending: "Creating…",
    // Deliberately says nothing about which layer failed: the person reading it can
    // only retry, and an api error code is not information they can act on.
    failed: "We could not create that series. Please try again.",
  },
} as const;

export type SeriesMessages = typeof series;
