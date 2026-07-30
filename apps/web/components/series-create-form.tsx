"use client";

import { seriesCreateInputSchema } from "@plotpop/contracts";
import { Button } from "@plotpop/ui/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { browserApi } from "@/lib/api-client";
import { messages } from "@/locales/en";

const COPY = messages.series.create;
const NAME = messages.series.name;

/**
 * Creating a series from the library page.
 *
 * The name is validated against the same Zod contract the api parses
 * (`docs/implementation-plan.md` §2), so the browser and the server agree on what a
 * name is rather than each keeping its own idea of it. The messages are not in the
 * contract: §14 keeps visible copy in the localisation resource, so the mapping from
 * an issue code to a sentence happens here.
 *
 * The library itself is rendered by the Server Component that owns the page, so a
 * created series appears by asking the page to re-read rather than by this form
 * keeping a second copy of the list.
 */
export function SeriesCreateForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailed(false);

    const parsed = seriesCreateInputSchema.safeParse({ name });

    if (!parsed.success) {
      const issue = parsed.error.issues.find((candidate) => candidate.path[0] === "name");

      setNameError(issue?.code === "too_big" ? NAME.errors.tooLong : NAME.errors.required);

      return;
    }

    setNameError(undefined);
    setPending(true);

    const response = await browserApi.api.v1.workspaces[":workspaceId"].series.$post({
      param: { workspaceId },
      json: parsed.data,
    });

    setPending(false);

    if (response.status !== 201) {
      // What was typed stays where it is: asking someone to retype a name because a
      // request failed is how a tool loses their trust.
      setFailed(true);

      return;
    }

    setName("");
    router.refresh();
  }

  return (
    <form className="flex w-full max-w-form flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <h2 className="text-heading-sm">{COPY.heading}</h2>

      {failed ? (
        // Text, not a colour alone (§2.3), and announced when it appears.
        <p className="text-body-sm text-destructive" role="alert">
          {COPY.failed}
        </p>
      ) : null}

      <Field data-invalid={nameError !== undefined}>
        <FieldLabel htmlFor={nameId}>{NAME.label}</FieldLabel>
        <Input
          aria-describedby={nameError === undefined ? undefined : errorId}
          aria-invalid={nameError !== undefined}
          id={nameId}
          name="name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <FieldDescription>{COPY.description}</FieldDescription>
        {/* `announce` off: the field is one of one, so a live region here would
            duplicate what the label and the message already say. */}
        <FieldError id={errorId} announce={false}>
          {nameError}
        </FieldError>
      </Field>

      <div className="flex">
        <Button disabled={pending} type="submit">
          {pending ? COPY.pending : COPY.submit}
        </Button>
      </div>
    </form>
  );
}
