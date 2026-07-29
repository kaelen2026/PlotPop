import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ApiHarness,
  createApiHarness,
  sessionCookie,
  TEST_PASSWORD,
} from "./testing/harness.js";

/**
 * Better Auth is mounted on the api, not on the web tier (ADR-007), so these are
 * the api's routes to keep working. The requests below are the ones a browser
 * makes: same paths, same JSON, same cookies.
 */
describe("email and password sign up", () => {
  let harness: ApiHarness;

  beforeAll(async () => {
    harness = await createApiHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
    return harness.app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: harness.origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("signs a new account up and returns a session cookie", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Nia",
      email: "nia@plotpop.test",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/better-auth\.session_token=/);
  });

  it("recognises the caller on a later request carrying that cookie", async () => {
    const signUp = await post("/api/auth/sign-up/email", {
      name: "Ravi",
      email: "ravi@plotpop.test",
      password: TEST_PASSWORD,
    });

    const session = await harness.app.request("/api/auth/get-session", {
      headers: { cookie: sessionCookie(signUp) },
    });

    expect(session.status).toBe(200);
    expect((await session.json()) as { user: { email: string } }).toMatchObject({
      user: { email: "ravi@plotpop.test" },
    });
  });

  it("signs an existing account in with its password", async () => {
    await post("/api/auth/sign-up/email", {
      name: "Mika",
      email: "mika@plotpop.test",
      password: TEST_PASSWORD,
    });

    const response = await post("/api/auth/sign-in/email", {
      email: "mika@plotpop.test",
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toMatch(/better-auth\.session_token=/);
  });

  it("refuses the wrong password without saying which half was wrong", async () => {
    await post("/api/auth/sign-up/email", {
      name: "Odile",
      email: "odile@plotpop.test",
      password: TEST_PASSWORD,
    });

    const response = await post("/api/auth/sign-in/email", {
      email: "odile@plotpop.test",
      password: "not-the-password-we-set",
    });

    expect(response.status).toBe(401);
    expect(await response.text()).not.toMatch(/password is wrong|no such user/i);
  });

  // The unique index on `user.email` is the thing being relied on here: two
  // concurrent sign-ups cannot both win.
  it("refuses a second account on an address already taken", async () => {
    await post("/api/auth/sign-up/email", {
      name: "Tam",
      email: "tam@plotpop.test",
      password: TEST_PASSWORD,
    });

    const again = await post("/api/auth/sign-up/email", {
      name: "Tam Again",
      email: "tam@plotpop.test",
      password: TEST_PASSWORD,
    });

    expect(again.ok).toBe(false);
  });

  it("refuses a password below the length the api requires", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Short",
      email: "short@plotpop.test",
      password: "tooshort",
    });

    expect(response.ok).toBe(false);
  });

  it("reports no session at all when the request carries no cookie", async () => {
    const response = await harness.app.request("/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
