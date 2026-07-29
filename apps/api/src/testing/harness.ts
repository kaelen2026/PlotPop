import { type AuthService, createAuthService } from "@plotpop/auth";
import { applyMigrations, type Database } from "@plotpop/db";
import { createTestDatabase, type TestDatabase } from "@plotpop/db/testing";
import { createApp } from "../app.js";
import { migrationSources } from "../migrations.js";

/*
 * Test-only wiring. Excluded from the build in `tsconfig.json`, so nothing here
 * reaches a running service.
 *
 * The harness builds the real route tree over a freshly migrated database. Only
 * the readiness reporter is faked, because probing dependencies is not what any
 * of these tests are about.
 */

/** Long enough for the api's own environment schema, and obviously not a real secret. */
const TEST_SECRET = "integration-test-session-signing-secret";

const WEB_ORIGIN = "http://localhost:3000";

export type ApiHarness = {
  readonly app: ReturnType<typeof createApp>;
  readonly auth: AuthService;
  readonly db: Database;
  readonly origin: string;
  close(): Promise<void>;
};

export type ApiHarnessOptions = {
  readonly onUserCreated?: (user: { id: string; email: string; name: string }) => Promise<void>;
};

export async function createApiHarness(options: ApiHarnessOptions = {}): Promise<ApiHarness> {
  const database: TestDatabase = await createTestDatabase();
  await applyMigrations(database.db, migrationSources);

  const auth = createAuthService({
    db: database.db,
    secret: TEST_SECRET,
    baseUrl: WEB_ORIGIN,
    trustedOrigins: [WEB_ORIGIN],
    useSecureCookies: false,
    ...(options.onUserCreated ? { onUserCreated: options.onUserCreated } : {}),
  });

  const app = createApp({
    auth,
    readiness: async () => ({ status: "ready", service: "api", dependencies: [] }),
  });

  return {
    app,
    auth,
    db: database.db,
    origin: WEB_ORIGIN,
    close: () => database.drop(),
  };
}

export type SignedUpUser = {
  readonly email: string;
  /** The `Cookie` header value a subsequent request must carry to be recognised. */
  readonly cookie: string;
};

/** A password comfortably over the minimum, so length is never the thing under test. */
export const TEST_PASSWORD = "correct-horse-battery-staple";

/**
 * Signs a new user up through the real Better Auth route, which is also what
 * triggers workspace provisioning. Tests that need a signed-in caller go through
 * here rather than inserting rows, so they exercise the same path a browser does.
 */
export async function signUp(harness: ApiHarness, email: string): Promise<SignedUpUser> {
  const response = await harness.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: harness.origin },
    body: JSON.stringify({ name: email.split("@")[0], email, password: TEST_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`sign-up failed with ${response.status}: ${await response.text()}`);
  }

  return { email, cookie: sessionCookie(response) };
}

/** Reduces `Set-Cookie` headers to the `Cookie` header a browser would send back. */
export function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
}
