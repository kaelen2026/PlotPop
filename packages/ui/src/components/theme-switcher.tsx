"use client";

import { Skeleton } from "@plotpop/ui/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@plotpop/ui/components/ui/toggle-group";
import { cn } from "@plotpop/ui/lib/cn";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";
import { type ThemePreference, themePreferenceSchema } from "../theme/preference";
import { useTheme } from "../theme/use-theme";

/**
 * The `system | light | dark` control from `docs/design-system.md` §5.1.
 *
 * §11.2 puts three mutually exclusive options in a `ToggleGroup`, which Radix
 * exposes as a radio group, so the keyboard and screen reader behaviour comes
 * from the primitive rather than from ad hoc handlers.
 *
 * Copy arrives as props: §14 forbids visible strings inside base components, and
 * this package must stay free of localisation resources.
 */
export type ThemeSwitcherLabels = {
  [Key in "group" | ThemePreference]: string;
};

const OPTIONS: { value: ThemePreference; Icon: ComponentType<{ className?: string }> }[] = [
  { value: "system", Icon: Monitor },
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
];

export function ThemeSwitcher({
  labels,
  className,
}: {
  labels: ThemeSwitcherLabels;
  className?: string;
}) {
  const { preference, select } = useTheme();

  if (preference === undefined) {
    // Holds the row height so the header does not shift when the real control
    // replaces it (§11.3 uses Skeleton for exactly this).
    return <Skeleton className={cn("h-9 w-64", className)} />;
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={preference}
      aria-label={labels.group}
      onValueChange={(value) => {
        // Clicking the active option asks Radix to clear the selection. An unset
        // theme would leave every token unresolved, so only a real preference is
        // accepted.
        const chosen = themePreferenceSchema.safeParse(value);
        if (chosen.success) select(chosen.data);
      }}
      className={className}
    >
      {OPTIONS.map(({ value, Icon }) => (
        <ToggleGroupItem key={value} value={value}>
          <Icon aria-hidden />
          {labels[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
