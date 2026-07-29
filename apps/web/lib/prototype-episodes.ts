import { GENERATION_STATUSES, type GenerationStatus } from "@plotpop/contracts";

/**
 * Placeholder content for the F-02 prototype.
 *
 * The Web never reads the database (ADR-001), so real episodes arrive over
 * `/api/v1/*` once F-04 and F-05 exist. Until then this fixture stands in, and it
 * deliberately covers every state in `GENERATION_STATUSES` so the prototype is
 * also the visual acceptance surface for §12.4.
 *
 * Delete this module when the page reads the API.
 */
export type PrototypeEpisode = {
  id: string;
  title: string;
  series: string;
  status: GenerationStatus;
};

const TITLES: Record<GenerationStatus, { title: string; series: string }> = {
  draft: { title: "The Vending Machine Oracle", series: "Neon Alley" },
  queued: { title: "Rooftop Confession", series: "Neon Alley" },
  generating: { title: "Last Train to Kanazawa", series: "Neon Alley" },
  needs_review: { title: "The Understudy", series: "Paper Lanterns" },
  completed: { title: "A Very Loud Silence", series: "Paper Lanterns" },
  failed: { title: "Nine Lives, One Landlord", series: "Paper Lanterns" },
};

export const prototypeEpisodes: PrototypeEpisode[] = GENERATION_STATUSES.map((status, index) => ({
  id: `prototype-${index}`,
  status,
  ...TITLES[status],
}));
