import type { AuthService, AuthSession, AuthUser } from "@plotpop/auth";
import { createMiddleware } from "hono/factory";
import { unauthenticated } from "../errors.js";

/**
 * What a route behind `requireSession` can rely on. §19 puts the resolved user and
 * session on the request context so a route never re-reads a cookie, and so there
 * is exactly one place that decides who the caller is.
 */
export type SessionVariables = {
  user: AuthUser;
  session: AuthSession;
};

export type SessionEnv = { Variables: SessionVariables };

/**
 * Rejects a request without a valid session before it reaches a handler.
 *
 * The session is resolved from headers by Better Auth (ADR-007): the api does not
 * verify or issue one itself, so there is no second implementation of session
 * semantics to keep in step.
 */
export function requireSession(auth: AuthService) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const resolved = await auth.getSession(c.req.raw.headers);

    if (resolved === null) {
      return c.json(unauthenticated(), 401);
    }

    c.set("user", resolved.user);
    c.set("session", resolved.session);

    return next();
  });
}
