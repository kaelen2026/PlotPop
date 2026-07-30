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
