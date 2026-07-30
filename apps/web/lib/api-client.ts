import { createApiClient } from "@plotpop/api-client";

/**
 * The api as the browser reaches it.
 *
 * The base url is empty on purpose: the browser calls its own origin and Next
 * forwards `/api/*` to the api (ADR-007), which is what makes the session cookie
 * first-party. Pointing this at the api's own origin would make every request
 * cross-origin and its cookie third-party, which Safari drops — arriving as
 * randomly expiring logins rather than as an error anyone can debug.
 *
 * `ApiClient` is imported as a finished type, so the route tree is not re-inferred
 * in every file that calls the api (`docs/implementation-plan.md` §8.1).
 */
export const browserApi = createApiClient("");
