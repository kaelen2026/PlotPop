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
  rename: "Rename",
  save: "Save",
  conflict: "This series changed somewhere else.",
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

test("a series can be renamed, and the new name is what was stored", async ({ page }) => {
  await signUpThroughApi(page, testAccount("series-rename"));

  await page.goto("/series");
  await page.getByLabel(COPY.nameLabel).fill("Rooftop Confesions");
  await page.getByRole("button", { name: COPY.submit }).click();

  const library = page.getByRole("list", { name: COPY.listHeading });
  await expect(library).toContainText("Rooftop Confesions");

  await library.getByRole("button", { name: COPY.rename }).click();
  // Scoped to the row: the create form below carries the same field label, and an
  // unscoped query would type into it while proving nothing about the rename.
  await library.getByLabel(COPY.nameLabel).fill("Rooftop Confessions");
  await library.getByRole("button", { name: COPY.save }).click();

  await expect(library).toContainText("Rooftop Confessions");

  // Reloaded, so what is on screen came back from the database rather than from the
  // row's own state.
  await page.reload();
  await expect(page.getByRole("list", { name: COPY.listHeading })).toContainText(
    "Rooftop Confessions",
  );
});

/*
 * The revision conflict, driven the only way a browser can reach it: the page holds
 * revision 1, something else moves the series on, and the form's rename arrives stale.
 * Two tabs belonging to one creator is exactly this, and it is the case §20.6 exists for.
 */
test("a rename from a page that has gone stale is refused, not applied", async ({ page }) => {
  await signUpThroughApi(page, testAccount("series-stale"));

  await page.goto("/series");
  await page.getByLabel(COPY.nameLabel).fill("Original");
  await page.getByRole("button", { name: COPY.submit }).click();

  const library = page.getByRole("list", { name: COPY.listHeading });
  await expect(library).toContainText("Original");

  // Open the form while it still believes the series is at revision 1.
  await library.getByRole("button", { name: COPY.rename }).click();
  await page.getByLabel(COPY.nameLabel).nth(1).fill("From The Open Form");

  // Meanwhile, the series moves on. Through the api, because a second browser context
  // would not share this page's session.
  const workspace = await page.request.get("/api/v1/workspaces/current");
  const { id: workspaceId } = (await workspace.json()) as { id: string };
  const listed = await page.request.get(`/api/v1/workspaces/${workspaceId}/series`);
  const { series } = (await listed.json()) as { series: { id: string; revision: number }[] };
  const target = series[0] as { id: string; revision: number };

  const elsewhere = await page.request.patch(
    `/api/v1/workspaces/${workspaceId}/series/${target.id}`,
    { data: { name: "Renamed Elsewhere", revision: target.revision } },
  );
  expect(elsewhere.status()).toBe(200);

  await library.getByRole("button", { name: COPY.save }).click();

  // Scoped to the row as well: Next's route announcer is also an `alert`.
  await expect(library.getByRole("alert")).toContainText(COPY.conflict);
  // And the stale name was not written: the update was conditional, so nothing was
  // silently overwritten.
  await page.reload();
  await expect(page.getByRole("list", { name: COPY.listHeading })).toContainText(
    "Renamed Elsewhere",
  );
  await expect(page.getByText("From The Open Form")).toBeHidden();
});
