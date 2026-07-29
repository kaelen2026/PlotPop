import { z } from "zod";

/**
 * The email and password rules, in one place.
 *
 * The web tier validates a form against these before a request leaves the browser
 * and the api configures Better Auth from the same constants, so a rule cannot
 * hold in one tier and not the other (`docs/implementation-plan.md` §2).
 */

/** 254 is the longest address SMTP will carry, so anything longer is a mistake. */
export const emailSchema = z.string().trim().max(254).pipe(z.email());

/**
 * Length rather than composition. Better Auth defaults to 8; twelve raises the
 * cost of guessing without pushing people towards the predictable substitutions a
 * composition rule produces. The ceiling only exists so a very long string cannot
 * be used to make hashing expensive.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;
export const MAXIMUM_PASSWORD_LENGTH = 128;

export const passwordSchema = z.string().min(MINIMUM_PASSWORD_LENGTH).max(MAXIMUM_PASSWORD_LENGTH);

/** The display name a workspace is named after when it is first provisioned (§19). */
export const displayNameSchema = z.string().trim().min(1).max(80);

export const signUpRequestSchema = z.strictObject({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

/**
 * The password is not re-validated on sign-in: the rule may have changed since the
 * account was made, and rejecting a password the api would have accepted tells an
 * attacker which rule era an address belongs to.
 */
export const signInRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;
