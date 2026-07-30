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
  referenceImage: "Reference image",
  rights: "I have the right to use this image.",
  imageAlt: "Reference image 1 for Ada",
  imageAltNew: "Reference image 1 for the new character",
  unsupportedImage: "That file is not a PNG, JPEG or WebP image.",
} as const;

/**
 * A 1x1 transparent PNG, and twelve bytes of HEIC header.
 *
 * Inline rather than committed as files: the bytes that matter are the signature at the
 * front, and a reviewer can see them here instead of taking a binary on trust.
 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** `ftypheic` at offset four — what a renamed phone photograph actually starts with. */
const HEIC_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

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

/*
 * §26's upload chain, and the only place it is exercised for real.
 *
 * `.claude/rules/tdd.md` §6 makes object storage a mocked boundary, so every other layer
 * runs against an in-memory store. What that cannot prove is the part that is entirely
 * configuration: the api signs a url for an origin the browser can reach, MinIO accepts a
 * cross-origin PUT carrying exactly the signed length and type, and the signed GET that
 * comes back in the payload actually serves the bytes. None of that fails in a unit test.
 */
test("a reference image uploaded in the browser reaches storage and comes back", async ({
  page,
}) => {
  await signUpThroughApi(page, testAccount("reference-image"));
  const seriesId = await createSeriesThroughApi(page, "Illustrated Series");

  await page.goto(`/series/${seriesId}`);
  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await expect(cast).toContainText("Version 1");

  await cast.getByRole("button", { name: COPY.updateAppearance }).click();

  // §195, §733: the picker is disabled until the creator confirms they hold the rights.
  const picker = cast.getByLabel(COPY.referenceImage);
  await expect(picker).toBeDisabled();
  await cast.getByLabel(COPY.rights).click();
  await expect(picker).toBeEnabled();

  await picker.setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });

  // The upload finishes before the version is saved, because a version row is never
  // rewritten and so cannot have an image attached afterwards.
  await expect(cast.getByAltText(COPY.imageAlt)).toBeVisible();

  await cast.getByRole("button", { name: COPY.saveVersion }).click();
  await expect(cast).toContainText("Version 2");

  // Reloaded, so the image on screen was read back from the database and re-signed rather
  // than left over from the form.
  await page.reload();
  const reloaded = page.getByRole("list", { name: COPY.castHeading });
  const image = reloaded.getByAltText(COPY.imageAlt);
  await expect(image).toBeVisible();

  /*
   * The bytes, fetched through the signed url the payload handed over. This is the assertion
   * the mocked layers cannot make: it fails if the signature is wrong, if the host was signed
   * for an address the browser cannot resolve, or if the object never arrived.
   */
  const source = await image.getAttribute("src");
  const served = await page.request.get(source as string);

  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect((await served.body()).equals(ONE_PIXEL_PNG)).toBe(true);
});

test("a file that is not the image it claims to be is refused", async ({ page }) => {
  /*
   * The mistake this whole confirmation step exists for, driven through a browser: the
   * declared type comes from the extension, so only reading the bytes catches it. Renaming
   * a HEIC photograph to `.png` is an ordinary thing to do on a Mac.
   */
  await signUpThroughApi(page, testAccount("reference-image-refused"));
  const seriesId = await createSeriesThroughApi(page, "Refused Upload");

  await page.goto(`/series/${seriesId}`);
  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await cast.getByRole("button", { name: COPY.updateAppearance }).click();
  await cast.getByLabel(COPY.rights).click();

  await cast
    .getByLabel(COPY.referenceImage)
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: HEIC_HEADER });

  // A sentence about the file, not "something went wrong": the creator has to know which
  // file to change.
  await expect(cast.getByText(COPY.unsupportedImage)).toBeVisible();

  // And saving still works — it just carries no image, because none was accepted.
  await cast.getByRole("button", { name: COPY.saveVersion }).click();
  await expect(cast).toContainText("Version 2");
  await expect(cast.getByAltText(COPY.imageAlt)).toBeHidden();
});

/*
 * The gap closed by giving the create form its own upload: until now the only way to get a
 * photograph onto a character was to create it from words and then edit it, which meant
 * version 1 could never have one. An episode generated from version 1 therefore had nothing
 * to look at.
 */
test("a character can be created with its reference image already attached", async ({ page }) => {
  await signUpThroughApi(page, testAccount("create-with-image"));
  const seriesId = await createSeriesThroughApi(page, "Illustrated From The Start");

  await page.goto(`/series/${seriesId}`);

  // The image is chosen before the character exists, so it is named for a character that has
  // no name yet.
  await page.getByLabel(COPY.rights).click();
  await page
    .getByLabel(COPY.referenceImage)
    .setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
  await expect(page.getByAltText(COPY.imageAltNew)).toBeVisible();

  await page.getByLabel(COPY.characterName).fill("Ada");
  await page.getByLabel(COPY.appearance).fill(APPEARANCE);
  await page.getByRole("button", { name: COPY.addCharacter }).click();

  const cast = page.getByRole("list", { name: COPY.castHeading });
  await expect(cast).toContainText("Ada");
  // Version 1, not 2: the image arrived with the character rather than after it.
  await expect(cast).toContainText("Version 1");

  await page.reload();
  const reloaded = page.getByRole("list", { name: COPY.castHeading });
  const image = reloaded.getByAltText(COPY.imageAlt);
  await expect(image).toBeVisible();

  // The bytes, through the signed url the payload handed back.
  const served = await page.request.get((await image.getAttribute("src")) as string);
  expect(served.status()).toBe(200);
  expect((await served.body()).equals(ONE_PIXEL_PNG)).toBe(true);

  // And the form is clean for the next one, so a second character cannot inherit this image.
  await expect(page.getByAltText(COPY.imageAltNew)).toBeHidden();
});
