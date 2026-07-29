"use client";

import { cn } from "@plotpop/ui/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry to satisfy `docs/design-system.md`. Run
 * `pnpm dlx shadcn@latest diff toggle` before pulling registry updates, and keep
 * these four deviations:
 *
 * - `text-label-md` replaces `text-sm font-medium`: §7.2 allows only the named
 *   type steps, and this one is the same 0.875rem at weight 500.
 * - `focus-visible:focus-ring` replaces the registry's 3px ring: §9.2 fixes the
 *   ring at 2px with a 2px offset, and uses an outline so a comic stroke or an
 *   overflow cannot clip it.
 * - `duration-fast` names the transition length instead of inheriting Tailwind's
 *   default (§10).
 * - Padding uses the approved steps from §8.1, so no `px-1.5` or `px-2.5`.
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-label-md whitespace-nowrap transition-[color,box-shadow] duration-fast outline-none hover:bg-muted hover:text-muted-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-2",
        lg: "h-10 min-w-10 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
