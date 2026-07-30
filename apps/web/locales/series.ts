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
    /**
     * Reference images (§32.1). A new version states its own images in full, so the copy has
     * to make clear that removing one is an edit going forward rather than a deletion — the
     * episodes made from the earlier version keep looking at what they were made from.
     */
    referenceImages: {
      label: "Reference image",
      description: "PNG, JPEG or WebP, up to 10 MB. Added to the new version you are saving.",
      /** §195, §733: the creator has to confirm they hold the rights to what they upload. */
      rights: "I have the right to use this image.",
      rightsRequired: "Confirm you have the right to use this image.",
      /** Shown above the images the new version will keep, so removing one is deliberate. */
      keeping: "Kept on the new version",
      /**
       * Alternative text has to say which character the image shows: a screen reader user
       * moving down a cast of ten would otherwise hear "reference image" ten times.
       *
       * The first copy in this project that interpolates, so `locales/en.test.ts` grew a
       * case for it — a function is copy too, and the gate has to see inside it.
       */
      alt: (characterName: string, position: number) =>
        `Reference image ${position} for ${characterName}`,
      remove: "Remove",
      uploading: "Uploading…",
      errors: {
        tooLarge: "That file is larger than 10 MB. Choose a smaller image.",
        unsupported: "That file is not a PNG, JPEG or WebP image. Choose a different one.",
        failed: "We could not upload that image. Please try again.",
        tooMany: "A version can carry up to 4 reference images.",
      },
    },
    /** Editing a character produces a new version rather than replacing the old one (§32.7). */
    update: {
      action: "Update appearance",
      submit: "Save as new version",
      cancel: "Cancel",
      pending: "Saving…",
      failed: "We could not save that version. Please try again.",
      conflict:
        "This character changed somewhere else. Reload to see its current appearance, then edit again.",
      reload: "Reload",
    },
    history: {
      show: "Earlier versions",
      hide: "Hide earlier versions",
      heading: "Version history",
      loading: "Loading…",
      failed: "We could not load the earlier versions. Please try again.",
      /** Every character has a first version, so this is what an unversioned edit leaves. */
      only: "This character has one version so far.",
    },
  },
} as const;

export type SeriesMessages = typeof series;
