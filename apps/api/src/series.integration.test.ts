import {
  apiErrorSchema,
  seriesListSchema,
  seriesSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiHarness, createApiHarness, type SignedUpUser, signUp } from "./testing/harness.js";

/**
 * The series routes (`docs/ai-comic-drama-saas-design.md` §6.1, §21).
 *
 * These are the first business routes that write, so isolation is pinned on both
 * verbs: `.claude/rules/tdd.md` §3 requires cross-workspace reads *and* writes to
 * be refused, and until now only reads had a route to refuse.
 *
 * Written against `testClient()` so the same run also checks that the route tree's
 * types reach the RPC client (`docs/implementation-plan.md` §8.1) — a client the web
 * tier consumes for these very routes.
 */
describe("series routes", () => {
  let harness: ApiHarness;
  let nia: SignedUpUser;
  let ravi: SignedUpUser;
  let niaWorkspaceId: string;

  beforeAll(async () => {
    harness = await createApiHarness();
    nia = await signUp(harness, "nia@plotpop.test");
    ravi = await signUp(harness, "ravi@plotpop.test");
    niaWorkspaceId = await currentWorkspaceId(nia);
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

  /** The series collection of a workspace; the id travels as a route parameter. */
  function seriesRoute() {
    return client().api.v1.workspaces[":workspaceId"].series;
  }

  it("creates a series in the caller's workspace and lists it back", async () => {
    const created = await seriesRoute().$post(
      { param: { workspaceId: niaWorkspaceId }, json: { name: "Rooftop Confessions" } },
      as(nia),
    );

    expect(created.status).toBe(201);
    const series = seriesSchema.parse(await created.json());
    expect(series).toMatchObject({ name: "Rooftop Confessions", revision: 1 });

    const listed = await seriesRoute().$get({ param: { workspaceId: niaWorkspaceId } }, as(nia));

    expect(listed.status).toBe(200);
    expect(seriesListSchema.parse(await listed.json()).series).toContainEqual(series);
  });

  it("trims the name it stores", async () => {
    const created = await seriesRoute().$post(
      { param: { workspaceId: niaWorkspaceId }, json: { name: "  Midnight Diner  " } },
      as(nia),
    );

    expect(seriesSchema.parse(await created.json()).name).toBe("Midnight Diner");
  });

  it("refuses a request without a session", async () => {
    const listed = await seriesRoute().$get({
      param: { workspaceId: niaWorkspaceId },
    });

    expect(listed.status).toBe(401);
    expect(apiErrorSchema.parse(await listed.json()).error).toMatchObject({
      code: "unauthenticated",
      action: "sign_in",
    });

    const created = await seriesRoute().$post({
      param: { workspaceId: niaWorkspaceId },
      json: { name: "Uninvited" },
    });

    expect(created.status).toBe(401);
  });

  /*
   * Not found rather than forbidden, on both verbs: a `403` would confirm the id
   * names something real, which turns guessing at ids into a way to learn whose
   * work exists.
   */
  it("hides another member's workspace from reads", async () => {
    const response = await seriesRoute().$get({ param: { workspaceId: niaWorkspaceId } }, as(ravi));

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("refuses to write into another member's workspace", async () => {
    const response = await seriesRoute().$post(
      { param: { workspaceId: niaWorkspaceId }, json: { name: "Not Mine" } },
      as(ravi),
    );

    expect(response.status).toBe(404);

    // And nothing was left behind for the owner to find in their own library.
    const listed = await seriesRoute().$get({ param: { workspaceId: niaWorkspaceId } }, as(nia));
    const { series } = seriesListSchema.parse(await listed.json());

    expect(series.map((entry) => entry.name)).not.toContain("Not Mine");
  });

  it("answers a malformed workspace id as an unknown one", async () => {
    // Handing "not-a-uuid" to Postgres raises a driver error, and a `500` would
    // tell the caller their input reached the database.
    const response = await seriesRoute().$get({ param: { workspaceId: "not-a-uuid" } }, as(nia));

    expect(response.status).toBe(404);
  });

  it("rejects a name the contract does not accept", async () => {
    const blank = await seriesRoute().$post(
      { param: { workspaceId: niaWorkspaceId }, json: { name: "   " } },
      as(nia),
    );

    expect(blank.status).toBe(400);
    expect(apiErrorSchema.parse(await blank.json()).error).toMatchObject({
      code: "validation_failed",
      action: "none",
    });

    const tooLong = await seriesRoute().$post(
      { param: { workspaceId: niaWorkspaceId }, json: { name: "A".repeat(121) } },
      as(nia),
    );

    expect(tooLong.status).toBe(400);
  });

  it("rejects a body carrying fields the contract does not describe", async () => {
    // The contract is strict, so a client sending a revision it invented is told
    // rather than quietly having it dropped.
    const response = await harness.app.request(`/api/v1/workspaces/${niaWorkspaceId}/series`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: nia.cookie },
      body: JSON.stringify({ name: "Invented", revision: 9 }),
    });

    expect(response.status).toBe(400);
  });

  it("keeps each workspace's library to itself", async () => {
    const raviWorkspaceId = await currentWorkspaceId(ravi);

    await seriesRoute().$post(
      { param: { workspaceId: raviWorkspaceId }, json: { name: "Ravi's Series" } },
      as(ravi),
    );

    const listed = await seriesRoute().$get({ param: { workspaceId: niaWorkspaceId } }, as(nia));

    expect(
      seriesListSchema.parse(await listed.json()).series.map((entry) => entry.name),
    ).not.toContain("Ravi's Series");
  });
});
