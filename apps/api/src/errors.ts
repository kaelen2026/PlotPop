import type { ApiError, ApiErrorAction, ApiErrorCode } from "@plotpop/contracts";

/**
 * The api's failure payloads, built here rather than inline at each route so every
 * one of them carries the same shape (§21) and no route can invent a message.
 *
 * `messageKey` names copy in the web tier's locale resources; the api never sends
 * a sentence (`docs/design-system.md` §14).
 */
function apiError(code: ApiErrorCode, messageKey: string, action: ApiErrorAction): ApiError {
  return { error: { code, messageKey, action } };
}

/** No usable session on the request: the caller has to sign in, not retry. */
export function unauthenticated(): ApiError {
  return apiError("unauthenticated", "errors.unauthenticated", "sign_in");
}

/**
 * Used for a resource the caller may not see as well as one that does not exist.
 *
 * Answering `403` for someone else's workspace would confirm that it exists, which
 * turns an id in a url into a way to enumerate other people's work. A signed-in
 * caller who is not a member is told the same thing either way.
 */
export function notFound(): ApiError {
  return apiError("not_found", "errors.notFound", "none");
}

/**
 * The body did not match the contract.
 *
 * Which field failed is deliberately absent: the same Zod schema validated the
 * form before it submitted (`docs/implementation-plan.md` §2), so a request that
 * reaches here came from something other than the app, and field level detail
 * would be describing our schema to it. `action` is `none` because retrying the
 * same body cannot help.
 */
export function validationFailed(): ApiError {
  return apiError("validation_failed", "errors.validationFailed", "none");
}
