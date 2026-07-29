import {
  EPISODE_SCRIPT_MAX_LENGTH,
  EPISODE_SCRIPT_MIN_LENGTH,
  EPISODE_TITLE_MAX_LENGTH,
} from "@plotpop/contracts";

/**
 * The five step wizard (§5.3). Each step's description is what that step actually
 * does, taken from §7.1 to §7.5 — a creator reviewing the prototype needs to
 * recognise the flow, not read filler.
 *
 * Length limits are interpolated from the contract rather than typed out, so a
 * message cannot promise a limit the schema does not enforce.
 */
export const wizard = {
  title: "New episode",
  continue: "Continue",
  back: "Back",
  steps: {
    label: "Creation steps",
    script: "Script",
    cast: "Cast",
    storyboard: "Storyboard",
    animate: "Animate",
    export: "Export",
  },
  errorSummary: {
    title: "Fix these before continuing",
  },
  script: {
    description:
      "Paste your English script. PlotPop pulls out characters, locations, lines, actions and scene boundaries so you can check them before anything is generated.",
    title: {
      label: "Episode title",
      description: "Shown in your episode list and in exports.",
      errors: {
        required: "Give the episode a title.",
        tooLong: `Keep the title to ${EPISODE_TITLE_MAX_LENGTH} characters or fewer.`,
      },
    },
    body: {
      label: "Episode script",
      description:
        "Dialogue and action, in English. Scene headings help, but PlotPop can work without them.",
      placeholder: "INT. ROOFTOP - NIGHT\n\nMAYA\nYou came.",
      errors: {
        tooShort: `Paste at least ${EPISODE_SCRIPT_MIN_LENGTH} characters. A shorter script cannot be split into scenes.`,
        tooLong: `Keep the script to ${EPISODE_SCRIPT_MAX_LENGTH} characters or fewer.`,
      },
    },
  },
  cast: {
    description:
      "PlotPop matches the characters in your script to your existing series cast, or suggests new ones. You check every name, reference image, appearance and voice.",
  },
  storyboard: {
    description:
      "PlotPop drafts scenes and shots with duration, shot size, lines, action and prompts. Reorder, add, remove, split or merge them before any video is generated.",
  },
  animate: {
    description:
      "PlotPop estimates the credits and asks you to confirm, then reserves them and generates video and audio shot by shot.",
  },
  export: {
    description:
      "Review warnings and failed shots, then render the final cut. Export 1080p MP4 in 16:9 or 9:16, with burned in subtitles or clean, plus a separate subtitle file.",
  },
} as const;
