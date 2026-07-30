import {
  apiErrorSchema,
  characterListSchema,
  characterSchema,
  seriesSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiHarness, createApiHarness, type SignedUpUser, signUp } from "./testing/harness.js";

/**
 * The character routes (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
 *
 * Ownership reaches two levels from here on, and the tests that matter most are the ones
 * where the two halves disagree: a caller's own workspace paired with someone else's
 * series. Answering that with anything other than "not found" would turn an id in a url
 * into a way to read another creator's cast.
 */
describe("character routes", () => {
  let harness: ApiHarness;
  let nia: SignedUpUser;
  let ravi: SignedUpUser;
  let niaWorkspaceId: string;
  let niaSeriesId: string;
  let raviWorkspaceId: string;
  let raviSeriesId: string;

  const APPEARANCE = "Mid twenties, cropped black hair, round glasses, oversized grey coat.";

  beforeAll(async () => {
    harness = await createApiHarness();
    nia = await signUp(harness, "nia@plotpop.test");
    ravi = await signUp(harness, "ravi@plotpop.test");
    niaWorkspaceId = await currentWorkspaceId(nia);
    raviWorkspaceId = await currentWorkspaceId(ravi);
    niaSeriesId = await createSeries(nia, niaWorkspaceId, "Rooftop Confessions");
    raviSeriesId = await createSeries(ravi, raviWorkspaceId, "Midnight Diner");
  });

  afterAll(async () => {
    await harness.close();
  });

  function client() {
    return testClient(harness.app);
  }

  function as(user: SignedUpUser) {
    return { headers: { cookie: user.cookie } };
  }

  async function currentWorkspaceId(user: SignedUpUser): Promise<string> {
    const response = await client().api.v1.workspaces.current.$get({}, as(user));

    return workspaceSchema.parse(await response.json()).id;
  }

  async function createSeries(
    user: SignedUpUser,
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const response = await client().api.v1.workspaces[":workspaceId"].series.$post(
      { param: { workspaceId }, json: { name } },
      as(user),
    );

    return seriesSchema.parse(await response.json()).id;
  }

  function characters() {
    return client().api.v1.workspaces[":workspaceId"].series[":seriesId"].characters;
  }

  it("creates a character with its first version and lists it back", async () => {
    const created = await characters().$post(
      {
        param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
        json: { name: "Ada", appearance: APPEARANCE },
      },
      as(nia),
    );

    expect(created.status).toBe(201);
    const character = characterSchema.parse(await created.json());
    expect(character).toMatchObject({
      name: "Ada",
      revision: 1,
      currentVersion: { version: 1, appearance: APPEARANCE },
    });

    const listed = await characters().$get(
      { param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId } },
      as(nia),
    );

    expect(listed.status).toBe(200);
    expect(characterListSchema.parse(await listed.json()).characters).toContainEqual(character);
  });

  it("trims both fields it stores", async () => {
    const created = await characters().$post(
      {
        param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
        json: { name: "  Bao  ", appearance: "  Tall, shaved head.  " },
      },
      as(nia),
    );

    expect(characterSchema.parse(await created.json())).toMatchObject({
      name: "Bao",
      currentVersion: { appearance: "Tall, shaved head." },
    });
  });

  it("refuses a request without a session", async () => {
    const listed = await characters().$get({
      param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
    });

    expect(listed.status).toBe(401);
    expect(apiErrorSchema.parse(await listed.json()).error.code).toBe("unauthenticated");

    const created = await characters().$post({
      param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
      json: { name: "Uninvited", appearance: APPEARANCE },
    });

    expect(created.status).toBe(401);
  });

  it("hides another creator's cast from reads and writes", async () => {
    const listed = await characters().$get(
      { param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId } },
      as(ravi),
    );

    expect(listed.status).toBe(404);

    const created = await characters().$post(
      {
        param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
        json: { name: "Not Mine", appearance: APPEARANCE },
      },
      as(ravi),
    );

    expect(created.status).toBe(404);

    const owner = await characters().$get(
      { param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId } },
      as(nia),
    );
    expect(
      characterListSchema.parse(await owner.json()).characters.map((entry) => entry.name),
    ).not.toContain("Not Mine");
  });

  /*
   * The pairing that a single check would let through: the workspace is the caller's own,
   * so a route that verified only the workspace and then trusted the series id would read
   * and write another creator's cast.
   */
  it("refuses a series that is not in the workspace the caller named", async () => {
    const listed = await characters().$get(
      { param: { workspaceId: raviWorkspaceId, seriesId: niaSeriesId } },
      as(ravi),
    );

    expect(listed.status).toBe(404);

    const created = await characters().$post(
      {
        param: { workspaceId: raviWorkspaceId, seriesId: niaSeriesId },
        json: { name: "Wrong Series", appearance: APPEARANCE },
      },
      as(ravi),
    );

    expect(created.status).toBe(404);

    const raviCast = await characters().$get(
      { param: { workspaceId: raviWorkspaceId, seriesId: raviSeriesId } },
      as(ravi),
    );
    expect(
      characterListSchema.parse(await raviCast.json()).characters.map((entry) => entry.name),
    ).not.toContain("Wrong Series");
  });

  it("answers a malformed series id as an unknown one", async () => {
    const response = await characters().$get(
      { param: { workspaceId: niaWorkspaceId, seriesId: "not-a-uuid" } },
      as(nia),
    );

    expect(response.status).toBe(404);
  });

  it("rejects a character the contract does not accept", async () => {
    const blank = await characters().$post(
      {
        param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId },
        json: { name: "   ", appearance: APPEARANCE },
      },
      as(nia),
    );

    expect(blank.status).toBe(400);
    expect(apiErrorSchema.parse(await blank.json()).error.code).toBe("validation_failed");

    // A character with no appearance generates nothing, so the api will not store one
    // (§32.7). This is the request a client would send if it forgot the field.
    const withoutAppearance = await harness.app.request(
      `/api/v1/workspaces/${niaWorkspaceId}/series/${niaSeriesId}/characters`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: nia.cookie },
        body: JSON.stringify({ name: "Faceless" }),
      },
    );

    expect(withoutAppearance.status).toBe(400);
  });

  it("keeps each series' cast to itself", async () => {
    const second = await createSeries(nia, niaWorkspaceId, "Second Series");

    await characters().$post(
      {
        param: { workspaceId: niaWorkspaceId, seriesId: second },
        json: { name: "Only In The Second", appearance: APPEARANCE },
      },
      as(nia),
    );

    const first = await characters().$get(
      { param: { workspaceId: niaWorkspaceId, seriesId: niaSeriesId } },
      as(nia),
    );

    expect(
      characterListSchema.parse(await first.json()).characters.map((entry) => entry.name),
    ).not.toContain("Only In The Second");
  });
});
