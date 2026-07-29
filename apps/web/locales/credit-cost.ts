/**
 * §12.5: the one vocabulary for expressing a cost. A shared surface rather than a
 * page, because every operation that can spend credits reads from here.
 */
export const creditCost = {
  estimateLabel: "Estimated cost",
  balanceLabel: "Your balance",
  unit: "credits",
  rangeSeparator: "to",
  insufficient: "Not enough credits for this generation.",
  reconfirm: "The estimate changed. Check the new cost before continuing.",
  changeReasons: {
    quality_tier_changed: "You changed the quality tier.",
    shot_count_changed: "The number of shots changed.",
    estimate_increased: "The estimate went up since you last confirmed.",
  },
} as const;
