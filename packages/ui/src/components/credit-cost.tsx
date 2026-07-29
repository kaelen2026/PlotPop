import {
  type CreditEstimate,
  type CreditEstimateChangeReason,
  coversEstimate,
  isEstimateRange,
  requiresReconfirmation,
} from "@plotpop/contracts";
import { Alert, AlertDescription, AlertTitle } from "@plotpop/ui/components/ui/alert";
import { cn } from "@plotpop/ui/lib/cn";
import { CircleAlert, Info } from "lucide-react";

/**
 * The one way a cost is expressed (`docs/design-system.md` §12.5).
 *
 * It shows all five things §12.5 asks for — the estimate, whether it is a range,
 * whether the balance covers it, why it changed and whether it needs confirming
 * again — because a page that writes its own version will sooner or later leave
 * one out, and the one left out will be the one that mattered.
 *
 * The balance arrives inside the estimate, quoted by the server. §10 forbids the
 * client computing an authoritative balance, so this component never sees a ledger.
 *
 * Copy arrives as props (§14).
 */
export type CreditCostLabels = {
  estimateLabel: string;
  balanceLabel: string;
  unit: string;
  rangeSeparator: string;
  insufficient: string;
  reconfirm: string;
  changeReasons: Record<CreditEstimateChangeReason, string>;
};

function Amount({ credits }: { credits: number }) {
  // §7.4: credits use the Mono step so a changing estimate does not shift the
  // layout under the user's cursor.
  return (
    <span data-testid="credit-amount" className="text-mono-md">
      {credits}
    </span>
  );
}

export function CreditCost({
  estimate,
  labels,
  className,
}: {
  estimate: CreditEstimate;
  labels: CreditCostLabels;
  className?: string;
}) {
  const affordable = coversEstimate(estimate);
  const changed = requiresReconfirmation(estimate);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <dl className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1">
          <dt className="text-label-xs text-muted-foreground">{labels.estimateLabel}</dt>
          <dd className="flex items-center gap-2 text-body-md">
            <Amount credits={estimate.minCredits} />
            {isEstimateRange(estimate) ? (
              <>
                <span className="text-body-sm text-muted-foreground">{labels.rangeSeparator}</span>
                <Amount credits={estimate.maxCredits} />
              </>
            ) : null}
            <span className="text-body-sm text-muted-foreground">{labels.unit}</span>
          </dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt className="text-label-xs text-muted-foreground">{labels.balanceLabel}</dt>
          <dd className="flex items-center gap-2 text-body-md">
            <Amount credits={estimate.balanceCredits} />
            <span className="text-body-sm text-muted-foreground">{labels.unit}</span>
          </dd>
        </div>
      </dl>

      {affordable ? null : (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{labels.insufficient}</AlertTitle>
        </Alert>
      )}

      {changed && estimate.changeReason !== undefined ? (
        <Alert>
          <Info aria-hidden />
          <AlertTitle>{labels.reconfirm}</AlertTitle>
          <AlertDescription>{labels.changeReasons[estimate.changeReason]}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
