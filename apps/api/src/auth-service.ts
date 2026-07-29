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
     * The failure is logged rather than raised. Better Auth runs this hook after
     * the user row is committed, not inside its transaction, so throwing would
     * answer the sign-up with an error while leaving the account in place — and the
     * retry would then be refused as an address already in use. The workspace route
     * provisions on first read for exactly this case, so the account recovers on
     * its own and this is a warning about a slow database, not a lost user.
     */
    onUserCreated: async (user) => {
      try {
        const provisioned = await provisionDefaultWorkspace(db, {
          userId: user.id,
          name: user.name,
          email: user.email,
        });

        logger.info("workspace provisioned", { workspaceId: provisioned.id, at: "sign_up" });
      } catch (error) {
        logger.error("workspace provisioning deferred to first read", { userId: user.id, error });
      }
    },
  });
}
