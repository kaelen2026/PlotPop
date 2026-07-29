import { ThemeSwitcher } from "@plotpop/ui/components/theme-switcher";
import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/lib/routes";
import { messages } from "@/locales/en";

/**
 * The frame every signed in page sits in.
 *
 * This is application composition rather than a design system primitive, so
 * unlike `packages/ui` it reads the localisation resource directly (§14 keeps
 * copy out of base components, not out of pages).
 *
 * The skip link is the first focusable element on purpose: §15 requires a
 * continuous keyboard path, and a link placed after the header controls cannot
 * skip them.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-label-md focus:focus-ring"
      >
        {messages.shell.skipToContent}
      </a>

      <header className="stroke-hairline-b">
        {/* §8.3: `container-app` with page padding 4 on Small, 6 from Medium up. */}
        <div className="mx-auto flex w-full max-w-app items-center justify-between gap-4 p-4 md:p-6">
          <span className="font-display text-heading-md">PlotPop</span>
          <ThemeSwitcher labels={messages.theme} />
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
