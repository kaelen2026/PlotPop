"use client";

import { episodeDraftInputSchema } from "@plotpop/contracts";
import { Alert, AlertDescription, AlertTitle } from "@plotpop/ui/components/ui/alert";
import { Button } from "@plotpop/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import { Textarea } from "@plotpop/ui/components/ui/textarea";
import { TriangleAlert } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { WizardSteps } from "@/components/wizard-steps";
import { CREATION_STEPS } from "@/lib/creation-steps";
import { type ScriptStepErrors, scriptStepErrors } from "@/lib/script-step-errors";
import { messages } from "@/locales/en";

/**
 * The five step creation wizard (§5.3).
 *
 * Only the script step collects input so far; the rest describe what they will do
 * and can be walked through, which is what makes this a prototype of the flow
 * rather than of one screen. Their forms arrive in later slices.
 *
 * The draft lives above the step, so stepping back does not discard it.
 */
export function CreationWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState({ title: "", script: "" });
  const [errors, setErrors] = useState<ScriptStepErrors>({});

  const step = CREATION_STEPS[stepIndex] ?? "script";
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === CREATION_STEPS.length - 1;
  const summaryEntries = Object.values(errors);

  const titleErrorId = useId();
  const scriptErrorId = useId();

  // Counts failed submissions rather than watching `errors`, so submitting the
  // same invalid form twice still moves focus back to the summary.
  const [rejectedSubmissions, setRejectedSubmissions] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rejectedSubmissions > 0) summaryRef.current?.focus();
  }, [rejectedSubmissions]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "script") {
      const parsed = episodeDraftInputSchema.safeParse(draft);
      if (!parsed.success) {
        setErrors(scriptStepErrors(parsed.error.issues));
        setRejectedSubmissions((count) => count + 1);
        return;
      }
      setErrors({});
    }

    setStepIndex((current) => Math.min(current + 1, CREATION_STEPS.length - 1));
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-heading-lg">{messages.wizard.title}</h1>
        <WizardSteps current={step} />
      </div>

      {/* §8.3: a single wizard step is a form, so it uses the form container. */}
      <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-form flex-col gap-8">
        {summaryEntries.length > 0 ? (
          <Alert variant="destructive" ref={summaryRef} tabIndex={-1}>
            <TriangleAlert aria-hidden />
            <AlertTitle>{messages.wizard.errorSummary.title}</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {summaryEntries.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-heading-md">{messages.wizard.steps[step]}</h2>
          <p className="max-w-prose text-body-md text-muted-foreground">
            {messages.wizard[step].description}
          </p>

          {step === "script" ? (
            <FieldGroup>
              <Field data-invalid={errors.title !== undefined}>
                <FieldLabel htmlFor="episode-title">
                  {messages.wizard.script.title.label}
                </FieldLabel>
                <Input
                  id="episode-title"
                  value={draft.title}
                  aria-invalid={errors.title !== undefined}
                  aria-describedby={errors.title === undefined ? undefined : titleErrorId}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <FieldDescription>{messages.wizard.script.title.description}</FieldDescription>
                {/* The summary above is the one live region; announcing each
                    field as well would speak three times for two problems. */}
                <FieldError id={titleErrorId} announce={false}>
                  {errors.title}
                </FieldError>
              </Field>

              <Field data-invalid={errors.script !== undefined}>
                <FieldLabel htmlFor="episode-script">
                  {messages.wizard.script.body.label}
                </FieldLabel>
                <Textarea
                  id="episode-script"
                  rows={12}
                  value={draft.script}
                  placeholder={messages.wizard.script.body.placeholder}
                  aria-invalid={errors.script !== undefined}
                  aria-describedby={errors.script === undefined ? undefined : scriptErrorId}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, script: event.target.value }))
                  }
                />
                <FieldDescription>{messages.wizard.script.body.description}</FieldDescription>
                <FieldError id={scriptErrorId} announce={false}>
                  {errors.script}
                </FieldError>
              </Field>
            </FieldGroup>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-4">
          {isFirstStep ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
            >
              {messages.wizard.back}
            </Button>
          )}
          {isLastStep ? null : <Button type="submit">{messages.wizard.continue}</Button>}
        </div>
      </form>
    </div>
  );
}
