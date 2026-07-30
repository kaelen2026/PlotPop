import { z } from "zod";

/**
 * One error shape for every failure the api reports (`docs/ai-comic-drama-saas-design.md`
 * §21). Having exactly one means the RPC client infers a usable union across
 * `401`, `403`, `404`, `409` and `500` instead of a different shape per route.
 *
 * Nothing here comes from an exception. A driver message or a stack trace
 * describes our internals, and §21 keeps those out of responses; the detail goes
 * to the logs, and eventually to `traceId`.
 */
export const apiErrorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  /**
   * The bytes of an upload are not what was declared (§26).
   *
   * Separate from `validation_failed`, which assumes a request that could not have come
   * from our own form: a form can check the type the browser reports and the size, but
   * not what is inside the file. A photograph renamed `.png` passes every client side
   * check there is, so this is an ordinary outcome that needs its own answer.
   */
  "unsupported_media",
  "internal_error",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/**
 * What the caller can do about it, so a client does not have to infer intent from
 * a status code. The vocabulary is deliberately small and grows when a route needs
 * a genuinely different recovery.
 *
 * `reload` is that case: a revision conflict (§20.6) cannot be fixed by sending the
 * same request again, which is what `retry` invites. The caller has to read the
 * record as it now stands and decide what to do with the change someone else made.
 */
export const apiErrorActionSchema = z.enum(["none", "retry", "reload", "sign_in"]);

export type ApiErrorAction = z.infer<typeof apiErrorActionSchema>;

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    /**
     * A localisation key, not a sentence: §14 of `docs/design-system.md` keeps
     * visible copy in the web tier's resources, and the api is not the place a
     * translation would live.
     */
    messageKey: z.string().min(1),
    action: apiErrorActionSchema,
    /** Filled in once request tracing lands; a caller can quote it in a report. */
    traceId: z.string().min(1).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
