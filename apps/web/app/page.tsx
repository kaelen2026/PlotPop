import { ThemeSwitcher } from "@plotpop/ui/components/theme-switcher";
import { Button } from "@plotpop/ui/components/ui/button";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";

/**
 * Placeholder landing page. The marketing site belongs to F-11; until then this
 * exists so the prototype is reachable from the root, which is what makes the
 * F-02 deliverable a clickable prototype rather than a set of orphan routes.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* §8.3 page padding: 4 on Small, 6 from Medium up. */}
      <header className="flex items-center justify-between gap-4 p-4 md:p-6">
        {/* The wordmark is the brand name, not copy, so it is not localised. */}
        <h1 className="font-display text-heading-md">PlotPop</h1>
        <ThemeSwitcher labels={messages.theme} />
      </header>
      <div className="flex flex-1 items-center justify-center p-4 md:p-6">
        <Button asChild>
          <Link href={routes.creatorHome}>{messages.landing.openCreatorHome}</Link>
        </Button>
      </div>
    </div>
  );
}
