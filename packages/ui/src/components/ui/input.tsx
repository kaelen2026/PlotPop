import { cn } from "@plotpop/ui/lib/cn";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry to satisfy `docs/design-system.md`. Run
 * `pnpm dlx shadcn@latest diff input` before pulling registry updates, and keep
 * these deviations:
 *
 * - `text-body-md md:text-body-sm` replaces `text-base md:text-sm` (§7.2 names
 *   both steps). The two step arrangement is the registry's, and it is kept on
 *   purpose: 16px on small screens is what stops iOS zooming a focused field.
 * - `focus-visible:focus-ring` replaces the 3px ring, and the `aria-invalid` ring
 *   goes with it (§9.2). The invalid state stays visible through the destructive
 *   border, the `aria-invalid` attribute and the field's error text — never
 *   through colour alone.
 * - `dark:bg-input/30` is dropped. In this design system `input` is the control
 *   boundary colour (§6.3), not a fill, and a field that is transparent in Light
 *   but tinted in Dark is the kind of per theme divergence §16 exists to stop.
 * - `duration-fast` names the transition length (§10).
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-body-md shadow-xs transition-[color,box-shadow] duration-fast outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-label-md file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-body-sm",
        "focus-visible:focus-ring",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
