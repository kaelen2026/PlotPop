import { cn } from "@plotpop/ui/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry to satisfy `docs/design-system.md`. Run
 * `pnpm dlx shadcn@latest diff alert` before pulling registry updates, and keep
 * these deviations:
 *
 * - `stroke-hairline` replaces the bare `border`. In Tailwind v4 a border with no
 *   colour resolves to `currentColor`, which would frame a default alert in near
 *   black; §9.2 gives base surfaces the semantic border.
 * - Type steps replace `text-sm` and `font-medium tracking-tight` (§7.2). There
 *   is no approved tracking scale, so `tracking-tight` goes with them.
 * - `gap-y-1` replaces `gap-y-0.5` (§8.1).
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg stroke-hairline px-4 py-3 text-body-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 text-label-md", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-body-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
