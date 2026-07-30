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
  /**
   * The cast of one series (§20.2, §32.7). A character's appearance is versioned, and the
   * copy says so — a creator who does not know that will be surprised the first time an
   * old episode keeps the old look.
   */
  cast: {
    heading: "Cast",
    description:
      "Characters belong to the series, so every episode can reuse them. Changing how one looks creates a new version, and episodes keep the version they were made with.",
    version: "Version",
    empty: {
      title: "No characters yet",
      description:
        "Describe who is in this series. The description is what keeps a character recognisable from shot to shot.",
    },
    create: {
      heading: "New character",
      name: {
        label: "Character name",
        errors: {
          required: "Enter a name for the character.",
          tooLong: "Use 80 characters or fewer.",
        },
      },
      appearance: {
        label: "Appearance",
        description:
          "Age, build, hair, face, clothing — the details that should stay the same in every shot.",
        errors: {
          required: "Describe how this character looks.",
          tooLong: "Use 2000 characters or fewer.",
        },
      },
      submit: "Add character",
      pending: "Adding…",
      failed: "We could not add that character. Please try again.",
    },
  },
} as const;

export type SeriesMessages = typeof series;
