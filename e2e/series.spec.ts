import { expect, test } from "@playwright/test";
import { signUpThroughApi, testAccount } from "./support/session";

/**
 * Creating a series and seeing it in the library
 * (`docs/ai-comic-drama-saas-design.md` §5.2, §6.1).
 *
 * The first journey where a page reads and writes real business data, so what it
 * proves is the whole chain: a Server Component carrying the session cookie to the
 * api, the api scoping the workspace, PostgreSQL storing it, and the page re-reading
 * after the write. Each half has its own tests; nothing but this one runs them
 * together in a browser.
 *
 * Copy is restated from `apps/web/locales/series.ts` rather than imported, because a
 * gate should read the page the way a person does.
 */
const COPY = {
  title: "Series",
  emptyTitle: "No series yet",
  nameLabel: "Series name",
  submit: "Create series",
  listHeading: "Your series",
  navSeries: "Series",
} as const;

test("a new account starts with an empty library and can fill it", async ({ page }) => {
  await signUpThroughApi(page, testAccount("series"));

  await page.goto("/series");

  await expect(page.getByRole("heading", { name: COPY.title, level: 1 })).toBeVisible();
  await expect(page.getByText(COPY.emptyTitle)).toBeVisible();

  await page.getByLabel(COPY.nameLabel).fill("Rooftop Confessions");
  await page.getByRole("button", { name: COPY.submit }).click();

  /*
   * The list is rendered on the server, so this only appears once the page has
   * re-read the library through the api. Waiting for the row is waiting for that
   * round trip, which is the part worth proving.
   */
  const library = page.getByRole("list", { name: COPY.listHeading });
  await expect(library.getByText("Rooftop Confessions")).toBeVisible();
  await expect(page.getByText(COPY.emptyTitle)).toBeHidden();

  // And it is still there on a fresh navigation: what the page showed came from the
  // database, not from the form's own state.
  await page.reload();
  await expect(page.getByRole("list", { name: COPY.listHeading })).toContainText(
    "Rooftop Confessions",
  );
});

test("one account cannot see another's library", async ({ page }) => {
  await signUpThroughApi(page, testAccount("series-owner"));
  await page.goto("/series");
  await page.getByLabel(COPY.nameLabel).fill("Private Series");
  await page.getByRole("button", { name: COPY.submit }).click();
  await expect(page.getByRole("list", { name: COPY.listHeading })).toContainText("Private Series");

  // A second account in the same browser, which is what a shared machine looks like.
  await page.context().clearCookies();
  await signUpThroughApi(page, testAccount("series-stranger"));
  await page.goto("/series");

  await expect(page.getByText(COPY.emptyTitle)).toBeVisible();
  await expect(page.getByText("Private Series")).toBeHidden();
});

test("a visitor without a session is sent to sign in", async ({ page }) => {
  await page.goto("/series");

  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the library is reachable from the shell without typing a url", async ({ page }) => {
  await signUpThroughApi(page, testAccount("series-nav"));

  await page.goto("/home");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: COPY.navSeries })
    .click();

  await expect(page.getByRole("heading", { name: COPY.title, level: 1 })).toBeVisible();
});
