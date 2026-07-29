"use client";

import { signInRequestSchema, signUpRequestSchema } from "@plotpop/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { AuthMessages } from "@/locales/auth";

/*
 * Sign-in and sign-up share this form: the fields, the validation and the failure
 * handling are the same, and only the extra name field and which client call to
 * make differ.
 *
 * The markup uses plain elements with semantic tokens rather than the design
 * system's form components, because `packages/ui` does not have them yet: Field,
 * FieldGroup, Input, Label, Button and Alert (`docs/design-system.md` §11.2, §11.3,
 * §12.1) all arrive with the component slice. Every visual value here is a token,
 * so replacing the markup will not change the design. Nothing is copied from
 * `packages/ui`, and no substitute component is introduced for one that exists.
 */

export type CredentialMode = "sign-in" | "sign-up";

export type CredentialFormProps = {
  readonly mode: CredentialMode;
  readonly copy: AuthMessages;
};

type FieldName = "name" | "email" | "password";

type FieldErrors = Partial<Record<FieldName, string>>;

/** Better Auth's code for the one sign-up failure worth naming to the user. */
const EMAIL_TAKEN = "USER_ALREADY_EXISTS";

export function CredentialForm({ mode, copy }: CredentialFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const pageCopy = isSignUp ? copy.signUp : copy.signIn;

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    /*
     * Validated against the same Zod contracts the api reads, so the browser and
     * the server agree on what a valid credential is rather than each keeping its
     * own idea of it (`docs/implementation-plan.md` §2).
     */
    const parsed = isSignUp
      ? signUpRequestSchema.safeParse({ name, email, password })
      : signInRequestSchema.safeParse({ email, password });

    if (!parsed.success) {
      const errors: FieldErrors = {};

      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name" || field === "email" || field === "password") {
          // The message comes from the locale resource, not from Zod: §14 keeps
          // visible copy out of schemas, and Zod's own text is not translated.
          errors[field] ??= copy.fieldErrors[field];
        }
      }

      setFieldErrors(errors);

      return;
    }

    setFieldErrors({});
    setPending(true);

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setPending(false);
      setFormError(
        isSignUp && result.error.code === EMAIL_TAKEN ? copy.signUp.emailTaken : pageCopy.failed,
      );

      return;
    }

    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-form flex-col justify-center gap-6 p-4 md:p-6">
      <h1 className="font-display text-heading-lg text-foreground">{pageCopy.title}</h1>

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        {formError === null ? null : (
          // Text, not a colour alone (§2.3), and announced when it appears.
          <p className="text-body-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        {isSignUp ? (
          <Field
            error={fieldErrors.name}
            label={copy.fields.name}
            name="name"
            type="text"
            autoComplete="name"
          />
        ) : null}

        <Field
          error={fieldErrors.email}
          label={copy.fields.email}
          name="email"
          type="email"
          autoComplete="email"
        />

        <Field
          error={fieldErrors.password}
          hint={isSignUp ? copy.fields.passwordHint : undefined}
          label={copy.fields.password}
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />

        <button
          className="rounded-md bg-primary px-4 py-2 text-label-md text-primary-foreground duration-fast focus-visible:focus-ring disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? copy.pending : pageCopy.submit}
        </button>
      </form>

      <p className="flex flex-wrap gap-2 text-body-sm text-muted-foreground">
        {pageCopy.switchPrompt}
        <Link
          className="text-accent underline focus-visible:focus-ring"
          href={isSignUp ? "/sign-in" : "/sign-up"}
        >
          {pageCopy.switchAction}
        </Link>
      </p>
    </main>
  );
}

type FieldProps = {
  readonly label: string;
  readonly name: FieldName;
  readonly type: "text" | "email" | "password";
  readonly autoComplete: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
};

/**
 * A stand-in for the design system's `Field`, kept local to this file so it is not
 * mistaken for a shared component. §11.2 requires `data-invalid` on the field and
 * `aria-invalid` on the control, which is what the real component will carry too.
 */
function Field({ label, name, type, autoComplete, hint, error }: FieldProps) {
  const invalid = error !== undefined;
  const describedBy = [hint === undefined ? null : `${name}-hint`, invalid ? `${name}-error` : null]
    .filter((id): id is string => id !== null)
    .join(" ");

  return (
    <div className="flex flex-col gap-1" data-invalid={invalid ? "true" : undefined}>
      <label className="text-label-md text-foreground" htmlFor={name}>
        {label}
      </label>
      <input
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={invalid}
        autoComplete={autoComplete}
        className="w-full rounded-sm bg-surface stroke-hairline px-3 py-2 text-body-md text-foreground focus-visible:focus-ring"
        id={name}
        name={name}
        type={type}
      />
      {hint === undefined ? null : (
        <p className="text-label-sm text-muted-foreground" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      {invalid ? (
        <p className="text-label-sm text-destructive" id={`${name}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
