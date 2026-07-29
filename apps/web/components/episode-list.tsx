import { GenerationStatusBadge } from "@plotpop/ui/components/generation-status-badge";
import type { PrototypeEpisode } from "@/lib/prototype-episodes";
import { messages } from "@/locales/en";

/**
 * The episode list on Creator Home.
 *
 * A real list rather than a stack of divs, so assistive technology announces how
 * many episodes there are, and `aria-labelledby` ties it to the section heading.
 *
 * Rows are not links yet: Episode Studio arrives in a later slice and a row that
 * navigates nowhere is worse than a row that does not offer to.
 */
export function EpisodeList({
  episodes,
  headingId,
}: {
  episodes: PrototypeEpisode[];
  headingId: string;
}) {
  return (
    <ul aria-labelledby={headingId} className="flex flex-col">
      {episodes.map((episode) => (
        <li
          key={episode.id}
          className="flex flex-wrap items-center justify-between gap-4 stroke-hairline-b py-4 last:border-b-0"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-heading-xs">{episode.title}</span>
            <span className="text-body-sm text-muted-foreground">{episode.series}</span>
          </div>
          <GenerationStatusBadge status={episode.status} labels={messages.generationStatus} />
        </li>
      ))}
    </ul>
  );
}
