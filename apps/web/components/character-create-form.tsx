"use client";

import { characterCreateInputSchema } from "@plotpop/contracts";
import { Button } from "@plotpop/ui/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import { Textarea } from "@plotpop/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { browserApi } from "@/lib/api-client";
import { messages } from "@/locales/en";

const COPY = messages.series.cast.create;

type FieldName = "name" | "appearance";

type FieldErrors = Partial<Record<FieldName, string>>;

/** The copy for one field's two failures, keyed the way the contract reports them. */
const FIELD_COPY = { name: COPY.name, appearance: COPY.appearance } as const;

/**
 * Adding a character to a series (§20.2, §32.7).
 *
 * Both fields are sent together because a character with no appearance cannot be
 * generated: the contract asks for the identity and its first version at once, and so
 * does this form.
 *
 * Validated against that same contract (`docs/implementation-plan.md` §2), with the
 * messages read from the localisation resource — §14 keeps them out of the schema, so a
 * cross service contract never carries a sentence.
 */
export function CharacterCreateForm({
  seriesId,
  workspaceId,
}: {
  seriesId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const nameId = useId();
  const nameErrorId = useId();
  const appearanceId = useId();
  const appearanceErrorId = useId();

  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailed(false);

    const parsed = characterCreateInputSchema.safeParse({ name, appearance });

    if (!parsed.success) {
      const found: FieldErrors = {};

      for (const field of ["name", "appearance"] as const) {
        const issue = parsed.error.issues.find((candidate) => candidate.path[0] === field);

        if (issue === undefined) continue;

        found[field] =
          issue.code === "too_big"
            ? FIELD_COPY[field].errors.tooLong
            : FIELD_COPY[field].errors.required;
      }

      setErrors(found);

      return;
    }

    setErrors({});
    setPending(true);

    const response = await browserApi.api.v1.workspaces[":workspaceId"].series[
      ":seriesId"
    ].characters.$post({
      param: { workspaceId, seriesId },
      json: parsed.data,
    });

    setPending(false);

    if (response.status !== 201) {
      // Both fields keep what was typed. Losing a paragraph of appearance description to
      // a failed request is how a tool teaches people to draft somewhere else first.
      setFailed(true);

      return;
    }

    setName("");
    setAppearance("");
    router.refresh();
  }

  return (
    <form className="flex w-full max-w-form flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <h3 className="text-heading-sm">{COPY.heading}</h3>

      {failed ? (
        // Text, not a colour alone (§2.3), and announced when it appears.
        <p className="text-body-sm text-destructive" role="alert">
          {COPY.failed}
        </p>
      ) : null}

      <Field data-invalid={errors.name !== undefined}>
        <FieldLabel htmlFor={nameId}>{COPY.name.label}</FieldLabel>
        <Input
          aria-describedby={errors.name === undefined ? undefined : nameErrorId}
          aria-invalid={errors.name !== undefined}
          id={nameId}
          name="name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <FieldError announce={false} id={nameErrorId}>
          {errors.name}
        </FieldError>
      </Field>

      <Field data-invalid={errors.appearance !== undefined}>
        <FieldLabel htmlFor={appearanceId}>{COPY.appearance.label}</FieldLabel>
        <Textarea
          aria-describedby={errors.appearance === undefined ? undefined : appearanceErrorId}
          aria-invalid={errors.appearance !== undefined}
          id={appearanceId}
          name="appearance"
          onChange={(event) => setAppearance(event.target.value)}
          rows={4}
          value={appearance}
        />
        <FieldDescription>{COPY.appearance.description}</FieldDescription>
        <FieldError announce={false} id={appearanceErrorId}>
          {errors.appearance}
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
