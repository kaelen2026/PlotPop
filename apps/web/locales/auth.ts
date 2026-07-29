/**
 * Copy for the sign-in and sign-up pages. `docs/design-system.md` §14 keeps every
 * visible string out of components, so the pages read it from here and pass it in.
 *
 * `fieldErrors` is keyed by the field names in `packages/contracts`, so a Zod issue
 * resolves to a message without a second mapping to keep in step.
 */
export const authMessages = {
  signIn: {
    title: "Sign in",
    submit: "Sign in",
    switchPrompt: "New to PlotPop?",
    switchAction: "Create an account",
    // Deliberately vague about which half was wrong: naming the address would let
    // anyone check whether it has an account here.
    failed: "That email and password do not match an account.",
  },
  signUp: {
    title: "Create your account",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
    failed: "We could not create your account. Please try again.",
    emailTaken: "An account already uses that email address.",
  },
  fields: {
    name: "Your name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 12 characters.",
  },
  fieldErrors: {
    name: "Enter the name you want to be called.",
    email: "Enter a valid email address.",
    password: "Use at least 12 characters.",
  },
  pending: "Working…",
} as const;

export type AuthMessages = typeof authMessages;
