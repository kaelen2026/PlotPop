import { expect, test } from "@playwright/test";
import { createSeriesThroughApi } from "./support/library";
import { signUpThroughApi, testAccount } from "./support/session";

/**
 * Building a series' cast (`docs/ai-comic-drama-saas-design.md` §5.2, §20.2, §32.7).
 *
 * The journey a creator actually takes: open a series from the library, find it empty, and
 * describe who is in it. What only this layer proves is that the two ids in the url are
 * carried correctly all the way from a link, through a Server Component read, to a write
 * the browser makes on its own origin.
 *
 * Copy is restated from `apps/web/locales/series.ts`, because a gate should read the page
 * the way a person does.
 */
const COPY = {
  seriesName: "Series name",
  createSeries: "Create series",
  libraryHeading: "Your series",
  castHeading: "Cast",
  castEmpty: "No characters yet",
  characterName: "Character name",
  appearance: "Appearance",
  addCharacter: "Add character",
  updateAppearance: "Update appearance",
  saveVersion: "Save as new version",
  showHistory: "Earlier versions",
  historyHeading: "Version history",
  conflict: "This character changed somewhere else.",
} as const;

const APPEARANCE = "Mid twenties, cropped black hair, round glasses, oversized grey coat.";

test("a series opens on an empty cast and can be filled", async ({ page }) => {
  await signUpThroughApi(page, testAccount("cast"));

  await page.goto("/series");
  await page.getByLabel(COPY.seriesName).fill("Rooftop Confessions");
  await page.getByRole("button", { name: COPY.createSeries }).click();

  // Into the series the way a creator gets there: the library row's title.
  await page
    .getByRole("list", { name: COPY.libraryHeading })
    .getByRole("link", { name: "Rooftop Confessions" })
    .click();

  await expect(page.getByRole("heading", { level: 1, name: "Rooftop Confessions" })).toBeVisible();
  await expect(page.getByText(COPY.castEmpty)).toBeVisible();

  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await expect(cast).toContainText("Ada");
  await expect(cast).toContainText(APPEARANCE);
  // §32.7: the version an episode would lock is on screen from the first character.
  await expect(cast).toContainText("Version 1");
  await expect(page.getByText(COPY.castEmpty)).toBeHidden();

  // Reloaded, so what is on screen came back from the database rather than from the
  // form's own state.
  await page.reload();
  await expect(page.getByRole("list", { name: COPY.castHeading })).toContainText("Ada");
});

test("a series belonging to someone else is not there to open", async ({ page }) => {
  await signUpThroughApi(page, testAccount("cast-owner"));
  const seriesId = await createSeriesThroughApi(page, "Private Series");

  // A second account in the same browser, which is what a shared machine looks like.
  await page.context().clearCookies();
  await signUpThroughApi(page, testAccount("cast-stranger"));

  const response = await page.goto(`/series/${seriesId}`);

  /*
   * Not found rather than forbidden, and not a redirect to the library either: a page that
   * behaved differently for a real id than for an invented one would turn guessing at ids
   * into a way to learn whose work exists.
   */
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Private Series")).toBeHidden();
});

test("a visitor without a session is sent to sign in", async ({ page }) => {
  await signUpThroughApi(page, testAccount("cast-signed-out"));
  const seriesId = await createSeriesThroughApi(page, "Needs A Session");

  await page.context().clearCookies();
  await page.goto(`/series/${seriesId}`);

  await expect(page).toHaveURL(/\/sign-in$/);
});

/*
 * §32.7's guarantee, driven end to end: changing an appearance must not erase what an
 * already generated episode was made with. Nothing else in the suite proves the earlier
 * version is still readable after the change.
 */
test("changing an appearance adds a version and keeps the earlier one readable", async ({
  page,
}) => {
  await signUpThroughApi(page, testAccount("versions"));
  const seriesId = await createSeriesThroughApi(page, "Versioned Series");

  await page.goto(`/series/${seriesId}`);
  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await expect(cast).toContainText("Version 1");

  await cast.getByRole("button", { name: COPY.updateAppearance }).click();
  await cast.getByLabel(COPY.appearance).fill("Now with a shaved head and a leather jacket.");
  await cast.getByRole("button", { name: COPY.saveVersion }).click();

  await expect(cast).toContainText("Version 2");
  await expect(cast).toContainText("Now with a shaved head and a leather jacket.");

  // The first version is still there to be read, which is the whole point of the split.
  await cast.getByRole("button", { name: COPY.showHistory }).click();
  const historyList = page.getByRole("list", { name: COPY.historyHeading });
  await expect(historyList).toContainText("Version 1");
  await expect(historyList).toContainText(APPEARANCE);

  // And it survives a reload, so it came from the database rather than the row's state.
  await page.reload();
  await expect(page.getByRole("list", { name: COPY.castHeading })).toContainText("Version 2");
});

test("an edit from a page that has gone stale is refused, not applied", async ({ page }) => {
  await signUpThroughApi(page, testAccount("versions-stale"));
  const seriesId = await createSeriesThroughApi(page, "Contested Series");

  await page.goto(`/series/${seriesId}`);
  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await expect(cast).toContainText("Version 1");

  // Open the editor while the page still believes the character is at revision 1.
  await cast.getByRole("button", { name: COPY.updateAppearance }).click();
  await cast.getByLabel(COPY.appearance).fill("From the open editor.");

  // Meanwhile the character moves on, through the api — a second browser context would not
  // share this page's session.
  const workspace = await page.request.get("/api/v1/workspaces/current");
  const { id: workspaceId } = (await workspace.json()) as { id: string };
  const listed = await page.request.get(
    `/api/v1/workspaces/${workspaceId}/series/${seriesId}/characters`,
  );
  const { characters } = (await listed.json()) as {
    characters: { id: string; revision: number }[];
  };
  const target = characters[0] as { id: string; revision: number };

  const elsewhere = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/series/${seriesId}/characters/${target.id}/versions`,
    { data: { appearance: "Changed elsewhere.", revision: target.revision } },
  );
  expect(elsewhere.status()).toBe(201);

  await cast.getByRole("button", { name: COPY.saveVersion }).click();

  await expect(cast.getByRole("alert")).toContainText(COPY.conflict);

  // Nothing was appended by the refused write: the character is at version 2, not 3.
  await page.reload();
  const reloaded = page.getByRole("list", { name: COPY.castHeading });
  await expect(reloaded).toContainText("Version 2");
  await expect(reloaded).toContainText("Changed elsewhere.");
  await expect(page.getByText("From the open editor.")).toBeHidden();
});
