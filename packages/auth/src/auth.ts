import { fileURLToPath } from "node:url";
import { MINIMUM_PASSWORD_LENGTH } from "@plotpop/contracts";
import type { Database, MigrationSource } from "@plotpop/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema } from "./schema.js";

/**
 * The Better Auth tables, to be applied before the business tables that
 * reference `user` (ADR-007). Resolved relative to this module, which sits one
 * level under the package root in both `src` and `dist`.
 */
export const authMigrationSource: MigrationSource = {
  name: "auth",
  directory: fileURLToPath(new URL("../migrations", import.meta.url)),
};

/** The identity fields the api is allowed to see. Never the password hash. */
export type AuthUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
};

export type AuthSession = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
};

export type AuthContext = {
  readonly user: AuthUser;
  readonly session: AuthSession;
};

/**
 * The seam between Better Auth and the api.
 *
 * Narrow on purpose: `apps/api` composes its route tree into the type
 * `packages/api-client` precomputes (`docs/implementation-plan.md` §8.1), and
 * letting Better Auth's inferred instance type into that tree would drag its
 * whole plugin surface through the client's type computation. It also keeps the
 * api honest about what it may read off a session.
 */
export type AuthService = {
  /** Serves `/api/auth/*`. Better Auth owns these routes; the api only forwards. */
  handler(request: Request): Promise<Response>;
  /** Resolves the caller from request headers, or null when there is no valid session. */
  getSession(headers: Headers): Promise<AuthContext | null>;
};

export type AuthServiceOptions = {
  readonly db: Database;
  /** Signs sessions. §28 keeps this in a secret manager, never in the database or a log. */
  readonly secret: string;
  /**
   * The origin the browser talks to. Production serves web and api from one
   * origin through a rewrite (ADR-007), so this is the web origin.
   */
  readonly baseUrl: string;
  /** Explicit allowlist; ADR-007 forbids localhost in production configuration. */
  readonly trustedOrigins: readonly string[];
  readonly useSecureCookies: boolean;
  /**
   * Runs inside sign-up, after the user row exists. §19 provisions the default
   * workspace and credit account here so a signed-up user always has somewhere to
   * work. The callback owns its own idempotency.
   */
  readonly onUserCreated?: (user: AuthUser) => Promise<void>;
};

export function createAuthService(options: AuthServiceOptions): AuthService {
  const auth = betterAuth({
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema }),
    secret: options.secret,
    baseURL: options.baseUrl,
    basePath: "/api/auth",
    trustedOrigins: [...options.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MINIMUM_PASSWORD_LENGTH,
      // Verification email delivery is a later slice. Requiring verification
      // before the first sign-in without a way to send the mail would lock every
      // new account out.
      requireEmailVerification: false,
    },
    advanced: {
      useSecureCookies: options.useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        // Lax rather than Strict: the session has to survive arriving from an
        // external link, and same-origin proxying already removes the
        // cross-site case Strict would be guarding (ADR-007).
        sameSite: "lax",
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await options.onUserCreated?.({
              id: created.id,
              email: created.email,
              name: created.name,
              emailVerified: created.emailVerified,
            });
          },
        },
      },
    },
  });

  return {
    handler: (request) => auth.handler(request),
    async getSession(headers) {
      const resolved = await auth.api.getSession({ headers });

      if (!resolved) return null;

      return {
        user: {
          id: resolved.user.id,
          email: resolved.user.email,
          name: resolved.user.name,
          emailVerified: resolved.user.emailVerified,
        },
        session: {
          id: resolved.session.id,
          userId: resolved.session.userId,
          expiresAt: resolved.session.expiresAt,
        },
      };
    },
  };
}
