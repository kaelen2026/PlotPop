import { GenerationStatusBadge } from "@plotpop/ui/components/generation-status-badge";
import Link from "next/link";
import type { PrototypeEpisode } from "@/lib/prototype-episodes";
import { episodeStudioRoute } from "@/lib/routes";
import { messages } from "@/locales/en";

/**
 * The episode list on Creator Home.
 *
 * A real list rather than a stack of divs, so assistive technology announces how
 * many episodes there are, and `aria-labelledby` ties it to the section heading.
 *
 * The title is the link rather than the whole row: a row sized link would swallow
 * the state badge into its accessible name, and there is nothing else in the row
 * to click.
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
            <Link
              href={episodeStudioRoute(episode.id)}
              className="text-heading-xs underline-offset-4 hover:underline focus-visible:focus-ring"
            >
              {episode.title}
            </Link>
            <span className="text-body-sm text-muted-foreground">{episode.series}</span>
          </div>
          <GenerationStatusBadge status={episode.status} labels={messages.generationStatus} />
        </li>
      ))}
    </ul>
  );
}
