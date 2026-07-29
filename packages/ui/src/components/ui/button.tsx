import { cn } from "@plotpop/ui/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

/**
 * Modified from the shadcn/ui registry to satisfy `docs/design-system.md`. Run
 * `pnpm dlx shadcn@latest diff button` before pulling registry updates, and keep
 * these deviations:
 *
 * - `text-label-md` / `text-label-xs` replace `text-sm font-medium` and
 *   `text-xs`: §7.2 allows only the named type steps.
 * - `focus-visible:focus-ring` replaces the registry's 3px ring (§9.2), and uses
 *   an outline so a comic stroke or an overflow cannot clip it.
 * - `transition-[color,box-shadow] duration-fast` replaces `transition-all`: §10
 *   allows motion that explains a state change, not size and position drift on
 *   every hover.
 * - `text-destructive-foreground` replaces `text-white`. This one is a contrast
 *   fix, not a preference: §6.4 makes `destructive` a light red in Dark, where
 *   white text on it falls below the required ratio. The registry's `dark:`
 *   opacity overrides go with it, because §6.4 already defines both themes.
 * - `border-input` on the outline variant in both themes: §6.3 puts the 3:1
 *   non-text obligation on `input`, and a control boundary that only exists in
 *   Dark is the failure that rule exists to prevent.
 * - Padding and gaps use the approved steps from §8.1.
 * - The `link` variant is removed: §12.1 is a closed list of five semantic
 *   variants, and inline links are styled as prose rather than as buttons.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-label-md whitespace-nowrap transition-[color,box-shadow] duration-fast outline-none focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-label-xs has-[>svg]:px-1 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-2 rounded-md px-3 has-[>svg]:px-2",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
