import { createAuthClient } from "better-auth/react";

/**
 * The only thing on the web tier that touches sessions, and it does not implement
 * them: ADR-007 keeps issuing and verifying with the api, so there is one session
 * semantics rather than two to keep in step.
 *
 * No origin is configured. The browser calls its own origin and the rewrite in
 * `next.config.ts` forwards `/api/auth/*` to the api, which is what makes the
 * cookie first-party.
 */
export const authClient = createAuthClient({ basePath: "/api/auth" });
