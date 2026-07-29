import { GENERATION_STATUSES, type GenerationStatus } from "@plotpop/contracts";
import { Badge } from "@plotpop/ui/components/ui/badge";
import { cn } from "@plotpop/ui/lib/cn";
import {
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  LoaderCircle,
  type LucideIcon,
  PencilLine,
} from "lucide-react";
import type { ComponentProps } from "react";

/**
 * The one place a task status becomes something a user can see.
 *
 * `docs/design-system.md` §12.4 defines the mapping and §6.8 forbids a state that
 * is only distinguishable by colour, so each state carries a label, an icon and a
 * semantic variant. The icon is decorative — the text is the state — which is why
 * it is hidden from assistive technology instead of being given a name that would
 * be announced twice.
 *
 * Labels arrive as props: §14 keeps visible copy out of base components.
 */
export type GenerationStatusLabels = Record<GenerationStatus, string>;

type StatusPresentation = {
  variant: ComponentProps<typeof Badge>["variant"];
  Icon: LucideIcon;
  /** §10: a spinner keeps turning under reduced motion, because "still working"
   * is information rather than decoration. */
  spins?: boolean;
};

const PRESENTATION: Record<GenerationStatus, StatusPresentation> = {
  draft: { variant: "secondary", Icon: PencilLine },
  queued: { variant: "info", Icon: Clock },
  generating: { variant: "info", Icon: LoaderCircle, spins: true },
  needs_review: { variant: "warning", Icon: Eye },
  completed: { variant: "success", Icon: CircleCheck },
  failed: { variant: "destructive", Icon: CircleX },
};

export function GenerationStatusBadge({
  status,
  labels,
  className,
}: {
  status: GenerationStatus;
  labels: GenerationStatusLabels;
  className?: string;
}) {
  const { variant, Icon, spins } = PRESENTATION[status];

  return (
    <Badge variant={variant} data-status={status} className={className}>
      <Icon aria-hidden className={cn(spins === true && "animate-spin")} />
      {labels[status]}
    </Badge>
  );
}

/** The lifecycle order from the contract, for lists and filters that group by state. */
export { GENERATION_STATUSES };
