import { EpisodeStudio } from "@/components/episode-studio";
import { prototypeEpisodeDetail } from "@/lib/prototype-episode-detail";

/**
 * The Studio does not use `AppShell`: §8.3 gives it the one unbounded workspace,
 * and §8 of the design spec gives it its own top bar carrying the series, the
 * episode and its state.
 *
 * The id is ignored until the page reads the API; every episode shows the same
 * prototype detail.
 */
export default function EpisodeStudioPage() {
  return <EpisodeStudio episode={prototypeEpisodeDetail} />;
}
