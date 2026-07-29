import { cn } from "@plotpop/ui/lib/cn";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry the same way as `input.tsx`, for the same
 * clauses: named type steps (§7.2), the §9.2 focus ring, no Dark only fill (§6.3),
 * and a named transition duration (§10). Run
 * `pnpm dlx shadcn@latest diff textarea` before pulling registry updates.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-body-md shadow-xs transition-[color,box-shadow] duration-fast outline-none placeholder:text-muted-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-body-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
