import type { Series } from "@plotpop/contracts";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plotpop/ui/components/ui/empty";
import { Library } from "lucide-react";
import { SeriesCreateForm } from "@/components/series-create-form";
import { messages } from "@/locales/en";

const COPY = messages.series;

const LIST_HEADING_ID = "series-list-heading";

/**
 * A workspace's series (`docs/ai-comic-drama-saas-design.md` §5.2, §6.1).
 *
 * Takes its series as a prop rather than reading them, so both display states are
 * reachable in a test and the page above stays the only place that talks to the api.
 *
 * The order is the api's, newest first, and is not re-sorted here: two places
 * deciding an order is how a list starts disagreeing with its own pagination.
 */
export function SeriesLibrary({ series, workspaceId }: { series: Series[]; workspaceId: string }) {
  const hasSeries = series.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-lg">{COPY.title}</h1>
        <p className="text-body-md text-muted-foreground">{COPY.description}</p>
      </div>

      {hasSeries ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-heading-md" id={LIST_HEADING_ID}>
            {COPY.list.heading}
          </h2>
          <ul aria-labelledby={LIST_HEADING_ID} className="flex flex-col">
            {series.map((entry) => (
              <li
                className="flex flex-wrap items-center justify-between gap-4 stroke-hairline-b py-4 last:border-b-0"
                key={entry.id}
              >
                {/* Not a link yet: a series has no detail page until the slice that
                    gives it one, and a link to nowhere is worse than plain text. */}
                <span className="text-heading-xs">{entry.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Library aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{COPY.empty.title}</EmptyTitle>
            <EmptyDescription>{COPY.empty.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <SeriesCreateForm workspaceId={workspaceId} />
    </>
  );
}
