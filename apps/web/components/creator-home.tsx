import { Button } from "@plotpop/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plotpop/ui/components/ui/empty";
import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EpisodeList } from "@/components/episode-list";
import type { PrototypeEpisode } from "@/lib/prototype-episodes";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";

const EPISODES_HEADING_ID = "episodes-heading";

/**
 * Creator Home.
 *
 * `docs/ai-comic-drama-saas-design.md` §5.2 gives this page four regions: series
 * and reusable assets, the episode list, the credit balance and spend history,
 * and the entry point for a new episode. The list and that entry point are here;
 * the other two are separate behaviours.
 *
 * It takes its episodes as a prop rather than reading them, so both display
 * states are reachable in a test and so the switch to real data is a change of
 * caller rather than a change of page.
 */
export function CreatorHome({ episodes }: { episodes: PrototypeEpisode[] }) {
  const hasEpisodes = episodes.length > 0;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-heading-lg">{messages.creatorHome.title}</h1>
        {/* §12.1: one visual primary action per region. On an empty account the
            primary action lives in the empty state instead. */}
        {hasEpisodes ? (
          <Button asChild>
            <Link href={routes.newEpisode}>{messages.creatorHome.empty.action}</Link>
          </Button>
        ) : null}
      </div>

      {hasEpisodes ? (
        <section className="flex flex-col gap-4">
          <h2 id={EPISODES_HEADING_ID} className="text-heading-md">
            {messages.creatorHome.episodes.heading}
          </h2>
          <EpisodeList episodes={episodes} headingId={EPISODES_HEADING_ID} />
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clapperboard aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{messages.creatorHome.empty.title}</EmptyTitle>
            <EmptyDescription>{messages.creatorHome.empty.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={routes.newEpisode}>{messages.creatorHome.empty.action}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </AppShell>
  );
}
