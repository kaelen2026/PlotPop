import { listWorkspacesForUser } from "@plotpop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiHarness, createApiHarness, signUp, TEST_PASSWORD } from "./testing/harness.js";

/**
 * The end of the sign-up path: §19 provisions a default workspace and credit
 * account, so a new account is never left with nowhere to work.
 *
 * These go through the real Better Auth route rather than calling the repository,
 * because the hook connecting the two is the part that can silently come undone.
 * What provisioning writes is covered in `packages/db`; what matters here is that
 * signing up runs it, once.
 */
describe("provisioning on sign up", () => {
  let harness: ApiHarness;

  beforeAll(async () => {
    harness = await createApiHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function userIdFor(email: string): Promise<string> {
    const { rows } = await harness.db.$client.query<{ id: string }>(
      'select id from "user" where email = $1',
      [email],
    );

    return rows[0]?.id as string;
  }

  it("gives a new account one workspace it is a member of", async () => {
    await signUp(harness, "nia@plotpop.test");

    const workspaces = await listWorkspacesForUser(harness.db, await userIdFor("nia@plotpop.test"));

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({ name: "nia", revision: 1 });
  });

  it("opens the workspace's credit account at zero", async () => {
    await signUp(harness, "ravi@plotpop.test");

    const [created] = await listWorkspacesForUser(harness.db, await userIdFor("ravi@plotpop.test"));
    const { rows } = await harness.db.$client.query<{
      available_credits: string;
      reserved_credits: string;
    }>("select available_credits, reserved_credits from credit_account where workspace_id = $1", [
      created?.id,
    ]);

    expect(rows).toMatchObject([{ available_credits: "0", reserved_credits: "0" }]);
  });

  // Signing in is not signing up. If provisioning ran on every authenticated
  // request instead of once, this is where it would show.
  it("does not add a second workspace when the same account signs in again", async () => {
    await signUp(harness, "mika@plotpop.test");
    const userId = await userIdFor("mika@plotpop.test");

    const signIn = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: harness.origin },
      body: JSON.stringify({ email: "mika@plotpop.test", password: TEST_PASSWORD }),
    });

    expect(signIn.status).toBe(200);
    expect(await listWorkspacesForUser(harness.db, userId)).toHaveLength(1);
  });

  it("gives two accounts two separate workspaces", async () => {
    await signUp(harness, "tam@plotpop.test");
    await signUp(harness, "sun@plotpop.test");

    const [tam] = await listWorkspacesForUser(harness.db, await userIdFor("tam@plotpop.test"));
    const [sun] = await listWorkspacesForUser(harness.db, await userIdFor("sun@plotpop.test"));

    expect(tam?.id).toBeDefined();
    expect(sun?.id).toBeDefined();
    expect(tam?.id).not.toBe(sun?.id);
  });
});
