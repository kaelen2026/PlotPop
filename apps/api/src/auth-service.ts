import { type AuthService, createAuthService } from "@plotpop/auth";
import { type Database, provisionDefaultWorkspace } from "@plotpop/db";
import type { Logger } from "@plotpop/observability";

export type ApiAuthOptions = {
  readonly db: Database;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly useSecureCookies: boolean;
  readonly logger: Logger;
};

/**
 * Better Auth wired the way this service runs it, in one place so the integration
 * tests exercise the same wiring the server does rather than an approximation of
 * it. `packages/auth` stays free of workspace knowledge: the sign-up hook is
 * supplied here.
 */
export function createApiAuthService({ db, logger, ...options }: ApiAuthOptions): AuthService {
  return createAuthService({
    db,
    ...options,
    /*
     * §19: a signed-up user has to land somewhere they can work, so the default
     * workspace and its credit account are created here, inside sign-up.
     *
     * `provisionDefaultWorkspace` is idempotent, which is what makes a retried or
     * concurrent sign-up safe. A failure is allowed to fail the sign-up: an
     * account with nowhere to work is worse than a sign-up the user can retry.
     */
    onUserCreated: async (user) => {
      const provisioned = await provisionDefaultWorkspace(db, {
        userId: user.id,
        name: user.name,
        email: user.email,
      });

      logger.info("workspace provisioned", { workspaceId: provisioned.id });
    },
  });
}
