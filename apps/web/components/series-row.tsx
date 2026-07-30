"use client";

import { type Series, seriesRenameInputSchema } from "@plotpop/contracts";
import { Button } from "@plotpop/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { browserApi } from "@/lib/api-client";
import { seriesDetailRoute } from "@/lib/routes";
import { messages } from "@/locales/en";

const COPY = messages.series.rename;
const NAME = messages.series.name;

/** What the last attempt ran into. `conflict` is the one with its own recovery. */
type Refusal = "conflict" | "failed";

/**
 * One series in the library, with the rename its row offers.
 *
 * A client component because renaming is an interaction, while the list around it stays
 * a Server Component read. The revision comes in with the series and goes back out with
 * the rename, which is what makes the update conditional rather than a blind overwrite
 * (§20.6): if someone else renamed it first, the api answers `409` and this row says so
 * instead of quietly winning.
 */
export function SeriesRow({ series, workspaceId }: { series: Series; workspaceId: string }) {
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();

  const field = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(series.name);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const [pending, setPending] = useState(false);

  /*
   * Focus follows the form that just opened (§15), so the keyboard path does not jump
   * back to the top of the page. Done here rather than with `autoFocus`, which is about
   * a document's initial focus and is a different claim.
   */
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  function startEditing(): void {
    setName(series.name);
    setNameError(undefined);
    setRefusal(undefined);
    setEditing(true);
  }

  function stopEditing(): void {
    setEditing(false);
    setNameError(undefined);
    setRefusal(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRefusal(undefined);

    const parsed = seriesRenameInputSchema.safeParse({ name, revision: series.revision });

    if (!parsed.success) {
      const issue = parsed.error.issues.find((candidate) => candidate.path[0] === "name");

      setNameError(issue?.code === "too_big" ? NAME.errors.tooLong : NAME.errors.required);

      return;
    }

    setNameError(undefined);
    setPending(true);

    const response = await browserApi.api.v1.workspaces[":workspaceId"].series[":seriesId"].$patch({
      param: { workspaceId, seriesId: series.id },
      json: parsed.data,
    });

    setPending(false);

    if (response.status !== 200) {
      /*
       * What was typed stays where it is, in both cases. On a conflict the page is not
       * refreshed either: re-reading behind their back would replace the row and throw
       * away the name they just wrote, so the reload is offered rather than performed.
       */
      setRefusal(response.status === 409 ? "conflict" : "failed");

      return;
    }

    setEditing(false);
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 stroke-hairline-b py-4 last:border-b-0">
      {editing ? (
        <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
          {refusal === undefined ? null : (
            // Text, not a colour alone (§2.3), and announced when it appears.
            <p className="text-body-sm text-destructive" role="alert">
              {refusal === "conflict" ? COPY.conflict : COPY.failed}
            </p>
          )}

          <Field data-invalid={nameError !== undefined}>
            <FieldLabel htmlFor={nameId}>{NAME.label}</FieldLabel>
            <Input
              aria-describedby={nameError === undefined ? undefined : errorId}
              aria-invalid={nameError !== undefined}
              id={nameId}
              name="name"
              onChange={(event) => setName(event.target.value)}
              ref={field}
              value={name}
            />
            <FieldError announce={false} id={errorId}>
              {nameError}
            </FieldError>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} type="submit">
              {pending ? COPY.pending : COPY.submit}
            </Button>
            <Button onClick={stopEditing} type="button" variant="ghost">
              {COPY.cancel}
            </Button>
            {refusal === "conflict" ? (
              <Button onClick={() => router.refresh()} type="button" variant="outline">
                {COPY.reload}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* The title is the link rather than the whole row: a row sized link would
              swallow the rename control into its accessible name. */}
          <Link
            className="text-heading-xs underline-offset-4 hover:underline focus-visible:focus-ring"
            href={seriesDetailRoute(series.id)}
          >
            {series.name}
          </Link>
          <Button onClick={startEditing} type="button" variant="outline">
            {COPY.action}
          </Button>
        </div>
      )}
    </li>
  );
}
