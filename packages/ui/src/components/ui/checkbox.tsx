"use client";

import { cn } from "@plotpop/ui/lib/cn";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry to satisfy `docs/design-system.md`. Run
 * `pnpm dlx shadcn@latest diff checkbox` before pulling registry updates, and keep
 * these five deviations:
 *
 * - The registry's `dark:bg-input/30` on the unchecked box is dropped: §6.6 keeps
 *   colour out of opacity mixes that `theme.test.ts` never verifies, and an
 *   unchecked box reads the same from its border in both themes — which is how
 *   `toggle.tsx` treats its own resting state.
 * - `accent` replaces the registry's `primary` for the checked state: §6.2 names
 *   accent as the colour of selection, and `toggle.tsx` is the precedent. The
 *   `state-expression.test.ts` gate enforces it, so this is not a preference.
 * - `rounded-sm` replaces `rounded-[4px]`: §8.3 names the radius steps, and an
 *   arbitrary value here would be the only 4px corner in the system.
 * - `focus-visible:focus-ring` replaces the registry's 3px ring and border swap:
 *   §9.2 fixes the ring at 2px with a 2px offset, and uses an outline so a comic
 *   stroke or an overflow cannot clip it.
 * - `size-3` replaces `size-3.5` on the indicator: §8.1 does not include a 3.5
 *   step, and the check reads the same inside a 4-unit box.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-input shadow-xs outline-none transition-shadow duration-fast focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground",
        className,
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="grid place-content-center text-current transition-none"
        data-slot="checkbox-indicator"
      >
        <CheckIcon className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
