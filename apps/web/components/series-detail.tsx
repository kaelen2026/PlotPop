import type { Character, Series } from "@plotpop/contracts";
import { Badge } from "@plotpop/ui/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plotpop/ui/components/ui/empty";
import { Users } from "lucide-react";
import { CharacterCreateForm } from "@/components/character-create-form";
import { messages } from "@/locales/en";

const COPY = messages.series.cast;

const CAST_HEADING_ID = "cast-heading";

/**
 * One series and its cast (`docs/ai-comic-drama-saas-design.md` §5.2, §20.2).
 *
 * Takes both as props rather than reading them, so every display state is reachable in a
 * test and the page above stays the only place that talks to the api.
 *
 * Each character shows which version is current, because §32.7 makes the version the
 * thing an episode locks: without it on screen, a creator cannot reason about why an
 * episode they made last month still looks the way it does.
 */
export function SeriesDetail({
  characters,
  series,
  workspaceId,
}: {
  characters: Character[];
  series: Series;
  workspaceId: string;
}) {
  const hasCast = characters.length > 0;

  return (
    <>
      <h1 className="text-heading-lg">{series.name}</h1>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-heading-md" id={CAST_HEADING_ID}>
            {COPY.heading}
          </h2>
          <p className="max-w-prose text-body-md text-muted-foreground">{COPY.description}</p>
        </div>

        {hasCast ? (
          <ul aria-labelledby={CAST_HEADING_ID} className="flex flex-col">
            {characters.map((entry) => (
              <li
                className="flex flex-col gap-2 stroke-hairline-b py-4 last:border-b-0"
                key={entry.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-heading-xs">{entry.name}</span>
                  {/* Text, not a colour or a position: §6.8 requires a state to carry a
                      label of its own. */}
                  <Badge variant="secondary">
                    {COPY.version} {entry.currentVersion.version}
                  </Badge>
                </div>
                <p className="max-w-prose text-body-sm text-muted-foreground">
                  {entry.currentVersion.appearance}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{COPY.empty.title}</EmptyTitle>
              <EmptyDescription>{COPY.empty.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <CharacterCreateForm seriesId={series.id} workspaceId={workspaceId} />
      </section>
    </>
  );
}
