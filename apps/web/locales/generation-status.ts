/**
 * §12.4: the labels for the contract's task states. Pages never invent one.
 *
 * A shared surface rather than one page's module — every surface that shows a
 * Generation Task reads these six, which is what keeps a status from being named
 * one thing in Creator Home and another in Episode Studio.
 */
export const generationStatus = {
  draft: "Draft",
  queued: "Queued",
  generating: "Generating",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
} as const;
