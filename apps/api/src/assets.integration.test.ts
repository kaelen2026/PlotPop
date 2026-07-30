import {
  apiErrorSchema,
  assetSchema,
  assetUploadTicketSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ApiHarness, createApiHarness, type SignedUpUser, signUp } from "./testing/harness.js";
import { fakeImageBytes } from "./testing/object-store.js";

/**
 * The asset routes (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * §26 has the browser upload straight to object storage, so nothing between the two
 * requests is under our control. What is pinned here is that this does not matter: the
 * signed url permits exactly the declared type and length, and confirmation reads the
 * bytes before the asset becomes usable. A client that lied, or a connection that dropped,
 * cannot produce a stored asset either way.
 */
describe("asset routes", () => {
  let harness: ApiHarness;
  let nia: SignedUpUser;
  let ravi: SignedUpUser;
  let niaWorkspaceId: string;
  let raviWorkspaceId: string;

  const PNG_SIZE = 2_048;

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

  function assets() {
    return client().api.v1.workspaces[":workspaceId"].assets;
  }

  async function requestTicket(
    user: SignedUpUser,
    workspaceId: string,
    overrides: { contentType?: "image/png" | "image/jpeg" | "image/webp"; byteSize?: number } = {},
  ) {
    return assets().$post(
      {
        param: { workspaceId },
        json: {
          purpose: "character_reference",
          contentType: overrides.contentType ?? "image/png",
          byteSize: overrides.byteSize ?? PNG_SIZE,
          rightsConfirmed: true,
        },
      },
      as(user),
    );
  }

  function confirm(user: SignedUpUser, workspaceId: string, assetId: string) {
    return assets()[":assetId"].confirmation.$post({ param: { workspaceId, assetId } }, as(user));
  }

  /** The whole of the happy path: ticket, the upload the browser would do, confirmation. */
  async function uploadPng(user: SignedUpUser, workspaceId: string) {
    const ticket = assetUploadTicketSchema.parse(
      await (await requestTicket(user, workspaceId)).json(),
    );
    const permission = harness.store.signed.at(-1);

    harness.store.put(permission?.key as string, fakeImageBytes("png", PNG_SIZE));

    return { ticket, confirmed: await confirm(user, workspaceId, ticket.assetId) };
  }

  describe("asking for an upload url", () => {
    it("signs permission for exactly what was declared", async () => {
      const response = await requestTicket(nia, niaWorkspaceId);

      expect(response.status).toBe(201);
      const ticket = assetUploadTicketSchema.parse(await response.json());
      expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(Date.now());

      /*
       * The type and the length are signed, which is what turns them from claims into
       * limits: a browser cannot send a different type or a longer body to this url and
       * have the signature verify.
       */
      expect(harness.store.signed.at(-1)).toMatchObject({
        contentType: "image/png",
        byteSize: PNG_SIZE,
      });
    });

    it("never lets the key reach the caller", async () => {
      // §26 keeps private material behind short-lived signed urls. The key is a permanent
      // handle, so it stays on our side of the boundary even though the url embeds it.
      const response = await requestTicket(nia, niaWorkspaceId);
      const body = (await response.json()) as Record<string, unknown>;

      expect(Object.keys(body).sort()).toEqual(["assetId", "expiresAt", "uploadUrl"]);
    });

    it("refuses a file larger than the documented cap", async () => {
      const response = await requestTicket(nia, niaWorkspaceId, { byteSize: 20 * 1024 * 1024 });

      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("validation_failed");
    });

    it("signs nothing for someone else's workspace", async () => {
      const signedBefore = harness.store.signed.length;
      const response = await requestTicket(nia, raviWorkspaceId);

      expect(response.status).toBe(404);
      // A 403 would confirm the workspace exists; and no url may be signed for it either,
      // which is the half a status code alone would not tell us.
      expect(harness.store.signed.length).toBe(signedBefore);
    });

    it("refuses an unconfirmed right to use the file", async () => {
      /*
       * §195, §733. The contract cannot express `rightsConfirmed: false`, so the typed
       * client cannot send one either — which is the point, and also why this goes through
       * a raw request. What is being checked is the answer given to something that is not
       * our form.
       */
      const response = await harness.app.request(`/api/v1/workspaces/${niaWorkspaceId}/assets`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: nia.cookie },
        body: JSON.stringify({
          purpose: "character_reference",
          contentType: "image/png",
          byteSize: PNG_SIZE,
          rightsConfirmed: false,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("confirming an upload", () => {
    it("returns the asset once the bytes are what they were declared to be", async () => {
      const { confirmed } = await uploadPng(nia, niaWorkspaceId);

      expect(confirmed.status).toBe(200);
      const asset = assetSchema.parse(await confirmed.json());
      expect(asset).toMatchObject({
        purpose: "character_reference",
        contentType: "image/png",
        byteSize: PNG_SIZE,
      });
      // The checksum is of the bytes we read, not of anything the client sent (§31.3).
      expect(asset.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it("says come back rather than failing when the object is not there yet", async () => {
      const ticket = assetUploadTicketSchema.parse(
        await (await requestTicket(nia, niaWorkspaceId)).json(),
      );

      const response = await confirm(nia, niaWorkspaceId, ticket.assetId);

      expect(response.status).toBe(409);
      // The only recoverable failure here: the PUT may still be in flight, and unlike a
      // revision conflict the same request will succeed once it lands.
      expect(apiErrorSchema.parse(await response.json()).error.action).toBe("retry");
    });

    it("rejects a photograph renamed to look like a png", async () => {
      /*
       * The case this whole confirmation step exists for, and it is a mistake rather than
       * an attack: macOS reports HEIC as png from the extension, so the form and the
       * signed url both pass and only the bytes disagree.
       */
      const ticket = assetUploadTicketSchema.parse(
        await (await requestTicket(nia, niaWorkspaceId)).json(),
      );
      harness.store.put(
        harness.store.signed.at(-1)?.key as string,
        fakeImageBytes("heic", PNG_SIZE),
      );

      const response = await confirm(nia, niaWorkspaceId, ticket.assetId);

      expect(response.status).toBe(422);
      const error = apiErrorSchema.parse(await response.json()).error;
      expect(error.code).toBe("unsupported_media");
      // Sending the same file again cannot help, so the creator is not invited to retry.
      expect(error.action).toBe("none");
    });

    it("rejects a real image that is not the type it was declared as", async () => {
      // The object was stored with the declared type as its metadata, so accepting jpeg
      // bytes under a png declaration would serve them as png for the rest of their life.
      const ticket = assetUploadTicketSchema.parse(
        await (await requestTicket(nia, niaWorkspaceId)).json(),
      );
      harness.store.put(
        harness.store.signed.at(-1)?.key as string,
        fakeImageBytes("jpeg", PNG_SIZE),
      );

      expect((await confirm(nia, niaWorkspaceId, ticket.assetId)).status).toBe(422);
    });

    it("rejects a body that is not the length that was signed for", async () => {
      const ticket = assetUploadTicketSchema.parse(
        await (await requestTicket(nia, niaWorkspaceId)).json(),
      );
      harness.store.put(harness.store.signed.at(-1)?.key as string, fakeImageBytes("png", 512));

      expect((await confirm(nia, niaWorkspaceId, ticket.assetId)).status).toBe(422);
    });

    it("leaves a rejected upload rejected, however many times it is confirmed", async () => {
      const ticket = assetUploadTicketSchema.parse(
        await (await requestTicket(nia, niaWorkspaceId)).json(),
      );
      const key = harness.store.signed.at(-1)?.key as string;
      harness.store.put(key, fakeImageBytes("heic", PNG_SIZE));

      expect((await confirm(nia, niaWorkspaceId, ticket.assetId)).status).toBe(422);

      // Replacing the object with something valid must not revive it: the bytes we read
      // and refused are not the bytes anyone would be approving now.
      harness.store.put(key, fakeImageBytes("png", PNG_SIZE));

      expect((await confirm(nia, niaWorkspaceId, ticket.assetId)).status).toBe(422);
    });

    it("answers a repeated confirmation with the same asset", async () => {
      // A client that never saw the first response is asking a question that still has the
      // same answer; the bytes cannot have changed.
      const { ticket, confirmed } = await uploadPng(nia, niaWorkspaceId);
      const first = assetSchema.parse(await confirmed.json());

      const again = await confirm(nia, niaWorkspaceId, ticket.assetId);

      expect(again.status).toBe(200);
      expect(assetSchema.parse(await again.json())).toEqual(first);
    });

    it("cannot be driven by someone who is not a member of the workspace", async () => {
      const { ticket } = await uploadPng(ravi, raviWorkspaceId);

      // Ravi's asset, named through Ravi's workspace by Nia.
      expect((await confirm(nia, raviWorkspaceId, ticket.assetId)).status).toBe(404);
      // And named through Nia's own workspace, which is the pairing a check on one half
      // alone would let through.
      expect((await confirm(nia, niaWorkspaceId, ticket.assetId)).status).toBe(404);
    });

    it("answers an unreadable asset id exactly as an unknown one", async () => {
      expect((await confirm(nia, niaWorkspaceId, "not-a-uuid")).status).toBe(404);
    });
  });

  describe("without a session", () => {
    it("signs nothing", async () => {
      const response = await assets().$post({
        param: { workspaceId: niaWorkspaceId },
        json: {
          purpose: "character_reference",
          contentType: "image/png",
          byteSize: PNG_SIZE,
          rightsConfirmed: true,
        },
      });

      expect(response.status).toBe(401);
    });
  });
});
