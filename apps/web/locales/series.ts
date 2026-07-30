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
  /**
   * The name field, shared by creating and renaming: two copies of "that is too long"
   * would be two answers to the same question.
   */
  name: {
    label: "Series name",
    errors: {
      required: "Enter a name for the series.",
      tooLong: "Use 120 characters or fewer.",
    },
  },
  create: {
    heading: "New series",
    description: "You can rename it later.",
    submit: "Create series",
    pending: "Creating…",
    // Deliberately says nothing about which layer failed: the person reading it can
    // only retry, and an api error code is not information they can act on.
    failed: "We could not create that series. Please try again.",
  },
  rename: {
    action: "Rename",
    submit: "Save",
    cancel: "Cancel",
    pending: "Saving…",
    failed: "We could not rename that series. Please try again.",
    /**
     * A revision conflict (§20.6). The api answers it with `reload`, because sending
     * the same name again would carry the same stale revision and fail the same way.
     */
    conflict: "This series changed somewhere else. Reload to see its current name, then rename it.",
    reload: "Reload",
  },
} as const;

export type SeriesMessages = typeof series;
