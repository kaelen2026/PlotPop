import type { GenerationStatus } from "@plotpop/contracts";

/**
 * Placeholder content for the Episode Studio prototype.
 *
 * Real scenes and shots arrive over `/api/v1/*` once F-05 exists; the Web never
 * reads the database (ADR-001). The fixture deliberately includes a failed shot,
 * because §13's rule that one failure must not block browsing the rest is only
 * checkable against an episode that has one.
 *
 * Delete this module when the page reads the API.
 */
export type PrototypeShot = {
  id: string;
  /** Position within the episode, which is what the user is shown and told. */
  number: number;
  durationSeconds: number;
  line: string;
  status: GenerationStatus;
};

export type PrototypeScene = {
  id: string;
  number: number;
  summary: string;
  shots: PrototypeShot[];
};

export type PrototypeEpisodeDetail = {
  id: string;
  title: string;
  series: string;
  status: GenerationStatus;
  scenes: PrototypeScene[];
};

export const prototypeEpisodeDetail: PrototypeEpisodeDetail = {
  id: "prototype-3",
  title: "The Understudy",
  series: "Paper Lanterns",
  status: "needs_review",
  scenes: [
    {
      id: "scene-1",
      number: 1,
      summary: "Backstage, ten minutes to curtain",
      shots: [
        {
          id: "shot-1",
          number: 1,
          durationSeconds: 4,
          line: "You are not going on tonight.",
          status: "completed",
        },
        {
          id: "shot-2",
          number: 2,
          durationSeconds: 6,
          line: "Watch me.",
          status: "completed",
        },
        {
          id: "shot-3",
          number: 3,
          durationSeconds: 3,
          line: "",
          status: "needs_review",
        },
      ],
    },
    {
      id: "scene-2",
      number: 2,
      summary: "The wings, curtain up",
      shots: [
        {
          id: "shot-4",
          number: 4,
          durationSeconds: 8,
          line: "She knows every line. She just has never said them out loud.",
          status: "generating",
        },
        {
          id: "shot-5",
          number: 5,
          durationSeconds: 5,
          line: "Then tonight she does.",
          status: "failed",
        },
      ],
    },
    {
      id: "scene-3",
      number: 3,
      summary: "Centre stage, the first line",
      shots: [
        {
          id: "shot-6",
          number: 6,
          durationSeconds: 7,
          line: "I have been waiting a long time to say this.",
          status: "queued",
        },
        {
          id: "shot-7",
          number: 7,
          durationSeconds: 4,
          line: "",
          status: "draft",
        },
      ],
    },
  ],
};
