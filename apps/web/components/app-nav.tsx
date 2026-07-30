"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";

const COPY = messages.shell.nav;

const DESTINATIONS = [
  { href: routes.creatorHome, label: COPY.creatorHome },
  { href: routes.series, label: COPY.series },
] as const;

/**
 * The pages a signed in creator moves between (`docs/ai-comic-drama-saas-design.md`
 * §5.2).
 *
 * A client component only so that it can read the current path: §15 forbids a state
 * that reads from colour alone, so the current page carries `aria-current="page"` and
 * a weight change rather than a tint. Keeping it here leaves the shell itself a
 * Server Component.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={COPY.label}>
      <ul className="flex items-center gap-4 md:gap-6">
        {DESTINATIONS.map(({ href, label }) => {
          const isCurrent = pathname === href;

          return (
            <li key={href}>
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "text-label-md text-foreground focus-visible:focus-ring"
                    : "text-label-md text-muted-foreground underline-offset-4 hover:underline focus-visible:focus-ring"
                }
                href={href}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
