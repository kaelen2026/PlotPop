"use client";

import { cn } from "@plotpop/ui/lib/cn";
import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry: `text-label-md` replaces
 * `text-sm leading-none font-medium`. §7.2 allows only the named type steps, and
 * this one is the same 0.875rem at weight 500 — with the step's line height
 * instead of `leading-none`, which collapsed a wrapped label onto itself.
 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-label-md select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
