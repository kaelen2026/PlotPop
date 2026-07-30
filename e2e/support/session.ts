import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./servers";

/**
 * Helpers for specs that need a signed-in browser.
 *
 * The browser gates run against a real api and a real database
 * (`playwright.config.ts`), so a session is created the way a person creates one
 * rather than injected. Two ways in, deliberately:
 *
 * - the sign-up form, which is the journey `auth.spec.ts` is about;
 * - `signUpThroughApi`, which is how every other gate arrives already signed in
 *   without re-testing a form it does not care about.
 */

/** Comfortably over the contract's minimum, so length is never what fails. */
export const TEST_PASSWORD = "correct-horse-battery-staple";

export type TestAccount = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

/**
 * A fresh account per call.
 *
 * The suite shares a database with local development and sign-up is the one thing
 * it appends to it, so a unique address is what keeps a rerun from colliding with
 * the run before it — on a developer's machine as much as in CI.
 */
export function testAccount(label: string): TestAccount {
  return {
    name: "Ada Lovelace",
    email: `e2e-${label}-${randomBytes(6).toString("hex")}@plotpop.test`,
    password: TEST_PASSWORD,
  };
}

/**
 * Signs a new account up through Better Auth's own route, inside the page's
 * context, so the session cookie applies to everything the spec does next.
 *
 * `page.request` shares the browser context's cookie jar, which is what leaves the
 * page signed in without going near the form. The `origin` header is set by hand
 * because an api request context sends none and Better Auth checks it (ADR-007).
 */
export async function signUpThroughApi(page: Page, account: TestAccount): Promise<TestAccount> {
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: WEB_ORIGIN },
    data: { name: account.name, email: account.email, password: account.password },
  });

  if (!response.ok()) {
    throw new Error(`sign-up failed with ${response.status()}: ${await response.text()}`);
  }

  return account;
}
