import { cn } from "@plotpop/ui/lib/cn";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry: the placeholder fill is `muted` rather
 * than `accent`, because `accent` is the brand blue in this design system (§6.2)
 * and a loading placeholder must not read as a selected or emphasised surface.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
