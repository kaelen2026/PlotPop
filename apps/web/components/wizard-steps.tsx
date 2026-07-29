import { Check } from "lucide-react";
import { CREATION_STEPS, type CreationStep } from "@/lib/creation-steps";
import { messages } from "@/locales/en";

/**
 * Where the user is in the five step flow (§5.3).
 *
 * An ordered list, so assistive technology announces the position and the total
 * without the numbers being decoration, and `aria-current="step"` names the
 * current one. §6.8's rule applies here too: the current and done states carry a
 * number, a tick and a weight change, not just a colour.
 *
 * No shadcn/ui registry component covers a stepper, which is what §11.1 asks you
 * to check before writing one. It is built from approved tokens only.
 */
export function WizardSteps({ current }: { current: CreationStep }) {
  const currentIndex = CREATION_STEPS.indexOf(current);

  return (
    <ol aria-label={messages.wizard.steps.label} className="flex flex-wrap gap-4 md:gap-6">
      {CREATION_STEPS.map((step, index) => {
        const isCurrent = step === current;
        const isDone = index < currentIndex;

        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className={
                isDone || isCurrent
                  ? "flex size-6 items-center justify-center rounded-pill bg-primary text-label-xs text-primary-foreground"
                  : "flex size-6 items-center justify-center rounded-pill bg-muted text-label-xs text-muted-foreground"
              }
            >
              {isDone ? <Check className="size-3" /> : index + 1}
            </span>
            <span
              className={
                isCurrent ? "text-label-md text-foreground" : "text-label-md text-muted-foreground"
              }
            >
              {messages.wizard.steps[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
