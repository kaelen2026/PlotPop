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
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";

/**
 * Creator Home before the account holds anything.
 *
 * `docs/ai-comic-drama-saas-design.md` §5.2 gives this page four regions: series
 * and reusable assets, the episode list grouped by state, the credit balance and
 * spend history, and the entry point for a new episode. Only the last one means
 * anything on an empty account, so that is all this state shows — §2.4 puts the
 * next action in front of the user instead of an inventory of features.
 */
export default function CreatorHomePage() {
  return (
    <AppShell>
      <h1 className="text-heading-lg">{messages.creatorHome.title}</h1>

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
    </AppShell>
  );
}
