import { expect, type Page, test } from "@playwright/test";
import { signUpThroughApi, testAccount } from "./support/session";

/**
 * The first journey that crosses Web, the api and PostgreSQL.
 *
 * F-03 delivered email sign-up, sign-in, same-origin proxying and the workspace a
 * new account is provisioned with, and each of those has integration coverage at
 * the api. What none of them proves is the chain: the browser calling its own
 * origin, Next forwarding `/api/*` (ADR-007), Better Auth setting a first-party
 * cookie, and a subsequent business request being recognised. That chain is what
 * breaks silently in configuration, so it is asserted here rather than reasoned
 * about.
 *
 * Copy comes from `apps/web/locales/auth.ts`. It is restated rather than imported,
 * because a gate should read the page the way a person does; renaming a label turns
 * this red, which is the point.
 */
const COPY = {
  name: "Your name",
  email: "Email",
  password: "Password",
  createAccount: "Create account",
  signIn: "Sign in",
  landing: "Open Creator Home",
} as const;

async function submitCredentials(
  page: Page,
  fields: { name?: string; email: string; password: string },
): Promise<void> {
  if (fields.name !== undefined) {
    await page.getByLabel(COPY.name).fill(fields.name);
  }
  await page.getByLabel(COPY.email).fill(fields.email);
  await page.getByLabel(COPY.password).fill(fields.password);
  await page
    .getByRole("button", { name: fields.name === undefined ? COPY.signIn : COPY.createAccount })
    .click();
}

test("a new account is signed in and has a workspace of its own", async ({ page }) => {
  const account = testAccount("sign-up");

  await page.goto("/sign-up");
  await submitCredentials(page, account);

  // The form navigates on success, so the landing page is the visible evidence
  // that Better Auth accepted the request.
  await expect(page.getByRole("link", { name: COPY.landing })).toBeVisible();

  /*
   * Asserted through the api rather than through a page, because no page reads a
   * workspace yet. The request goes to the web origin: it is the rewrite and the
   * first-party cookie under test as much as the provisioning behind them.
   */
  const current = await page.request.get("/api/v1/workspaces/current");

  expect(current.status()).toBe(200);
  expect(await current.json()).toMatchObject({ name: account.name });
});

test("an account can sign in again after its cookies are gone", async ({ page, context }) => {
  const account = await signUpThroughApi(page, testAccount("sign-in"));

  // What a person with a new browser has: the account exists, the session does not.
  await context.clearCookies();
  expect((await page.request.get("/api/v1/workspaces/current")).status()).toBe(401);

  await page.goto("/sign-in");
  await submitCredentials(page, { email: account.email, password: account.password });

  await expect(page.getByRole("link", { name: COPY.landing })).toBeVisible();
  expect((await page.request.get("/api/v1/workspaces/current")).status()).toBe(200);
});
