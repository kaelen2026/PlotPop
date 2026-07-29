import { apiErrorSchema, workspaceListSchema, workspaceSchema } from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiHarness, createApiHarness, type SignedUpUser, signUp } from "./testing/harness.js";

/**
 * Workspace isolation, which `.claude/rules/tdd.md` §3 requires to be pinned
 * before the routes exist: a leak here is silent, and the only thing standing
 * between two customers' work is that these reads are scoped.
 *
 * Written against `testClient()` rather than raw requests, so the same run also
 * checks that the route tree's types reach the RPC client
 * (`docs/implementation-plan.md` §8.1).
 */
describe("workspace isolation", () => {
  let harness: ApiHarness;
  let nia: SignedUpUser;
  let ravi: SignedUpUser;
  let niaWorkspaceId: string;
  let raviWorkspaceId: string;

  beforeAll(async () => {
    harness = await createApiHarness();
    nia = await signUp(harness, "nia@plotpop.test");
    ravi = await signUp(harness, "ravi@plotpop.test");
    niaWorkspaceId = await currentWorkspaceId(nia);
    raviWorkspaceId = await currentWorkspaceId(ravi);
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

  it("answers the caller's own workspace on the current route", async () => {
    const response = await client().api.v1.workspaces.current.$get({}, as(nia));

    expect(response.status).toBe(200);
    expect(workspaceSchema.parse(await response.json())).toMatchObject({
      id: niaWorkspaceId,
      name: "nia",
      revision: 1,
    });
  });

  it("lists only the workspaces the caller is a member of", async () => {
    const response = await client().api.v1.workspaces.$get({}, as(nia));

    expect(response.status).toBe(200);
    const { workspaces } = workspaceListSchema.parse(await response.json());

    expect(workspaces.map((entry) => entry.id)).toEqual([niaWorkspaceId]);
  });

  it("reads a workspace by id when the caller belongs to it", async () => {
    const response = await client().api.v1.workspaces[":workspaceId"].$get(
      { param: { workspaceId: niaWorkspaceId } },
      as(nia),
    );

    expect(response.status).toBe(200);
    expect(workspaceSchema.parse(await response.json()).id).toBe(niaWorkspaceId);
  });

  // Answered as not found rather than forbidden: a `403` would confirm the id
  // names something real, which turns guessing at ids into a way to learn whose
  // work exists.
  it("refuses another caller's workspace without confirming it exists", async () => {
    const response = await client().api.v1.workspaces[":workspaceId"].$get(
      { param: { workspaceId: raviWorkspaceId } },
      as(nia),
    );

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error).toMatchObject({
      code: "not_found",
    });
  });

  it("gives each caller their own workspace on the same route", async () => {
    const response = await client().api.v1.workspaces.current.$get({}, as(ravi));

    expect(workspaceSchema.parse(await response.json()).id).toBe(raviWorkspaceId);
    expect(raviWorkspaceId).not.toBe(niaWorkspaceId);
  });

  it("answers a malformed workspace id as not found rather than failing", async () => {
    const response = await client().api.v1.workspaces[":workspaceId"].$get(
      { param: { workspaceId: "not-a-uuid" } },
      as(nia),
    );

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });
});

describe("protected routes without a session", () => {
  let harness: ApiHarness;

  beforeAll(async () => {
    harness = await createApiHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it.each([
    ["the workspace list", "/api/v1/workspaces"],
    ["the current workspace", "/api/v1/workspaces/current"],
    ["a workspace by id", "/api/v1/workspaces/0b6c1e6e-0a3a-4f3d-9a2f-2a6d1b7b0f00"],
  ])("refuses %s with no cookie at all", async (_description, path) => {
    const response = await harness.app.request(path);

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error).toMatchObject({
      code: "unauthenticated",
      action: "sign_in",
    });
  });

  it("refuses a cookie that was not issued by this api", async () => {
    const response = await harness.app.request("/api/v1/workspaces/current", {
      headers: { cookie: "better-auth.session_token=forged.value" },
    });

    expect(response.status).toBe(401);
  });

  // §28 keeps internals out of responses: an unauthenticated reply must not name a
  // table, a driver or a library.
  it("says nothing about its internals when refusing", async () => {
    const body = await (await harness.app.request("/api/v1/workspaces")).text();

    expect(body).not.toMatch(/postgres|drizzle|better-auth|session_token|select /i);
  });
});
