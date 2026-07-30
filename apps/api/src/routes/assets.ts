import { zValidator } from "@hono/zod-validator";
import type { AuthService } from "@plotpop/auth";
import {
  type Asset,
  assetSchema,
  assetUploadRequestSchema,
  workspaceSchema,
} from "@plotpop/contracts";
import {
  assetIsReady,
  createPendingAsset,
  type Database,
  findAssetForMember,
  markAssetReady,
  markAssetRejected,
  type ReadyAssetRecord,
} from "@plotpop/db";
import { Hono } from "hono";
import { notFound, unsupportedMedia, uploadIncomplete, validationFailed } from "../errors.js";
import { detectImageContentType } from "../image-type.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";
import type { ObjectStore } from "../object-store.js";

export type AssetRouteDependencies = {
  readonly db: Database;
  readonly auth: AuthService;
  readonly store: ObjectStore;
};

/**
 * A confirmed asset as a caller sees it (§21 makes the contract the boundary).
 *
 * The storage key is not in it. §26 keeps private material behind short-lived signed
 * urls, and a key would be a permanent handle to the object.
 */
function toPayload(record: ReadyAssetRecord): Asset {
  return assetSchema.parse({
    id: record.id,
    purpose: record.purpose,
    contentType: record.contentType,
    byteSize: record.byteSize,
    checksumSha256: record.checksumSha256,
    createdAt: record.createdAt.toISOString(),
  });
}

/** An unreadable id names nothing, so it is answered exactly as an unknown one is. */
function parseWorkspaceId(workspaceId: string): string | null {
  const parsed = workspaceSchema.shape.id.safeParse(workspaceId);

  return parsed.success ? parsed.data : null;
}

function parseAssetId(assetId: string): string | null {
  const parsed = assetSchema.shape.id.safeParse(assetId);

  return parsed.success ? parsed.data : null;
}

/**
 * Uploading a reusable file (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * The shape of this is forced by §26: the browser uploads straight to object storage, so
 * one request reserves a key and signs permission to write it, and a second confirms what
 * actually arrived. Nothing between the two is trusted — the signed url pins the type and
 * the length, and confirmation reads the bytes before the asset becomes usable.
 *
 * §26 assigns the media checks to the Media Worker. They run here instead, synchronously,
 * because a worker handoff has to go through the outbox (ADR-003) and the outbox arrives
 * with F-05. What runs here is the integrity half — real type, real length, checksum —
 * and the note in §26 records that media parameters and safety scanning move to the
 * worker when the queue exists.
 */
export function createAssetRoutes({ db, auth, store }: AssetRouteDependencies) {
  return (
    new Hono<SessionEnv>()
      .use(requireSession(auth))
      /*
       * Creating an asset and signing its upload url are one request: a key that nothing
       * recorded would be an object we could never find again, and a row with no url is a
       * row nobody can complete.
       */
      .post(
        "/:workspaceId/assets",
        zValidator("json", assetUploadRequestSchema, (result, c) =>
          result.success ? undefined : c.json(validationFailed(), 400),
        ),
        async (c) => {
          const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));

          if (workspaceId === null) return c.json(notFound(), 404);

          const input = c.req.valid("json");
          const pending = await createPendingAsset(db, {
            workspaceId,
            userId: c.var.user.id,
            purpose: input.purpose,
            declaredContentType: input.contentType,
            declaredByteSize: input.byteSize,
          });

          // `null` means the workspace was not the caller's: the write scoped itself and
          // stored nothing. Same answer as an id that names nothing.
          if (pending === null) return c.json(notFound(), 404);

          const upload = await store.presignUpload({
            key: pending.storageKey,
            contentType: pending.declaredContentType,
            byteSize: pending.declaredByteSize,
          });

          return c.json(
            {
              assetId: pending.id,
              uploadUrl: upload.url,
              expiresAt: upload.expiresAt.toISOString(),
            },
            201,
          );
        },
      )
      /*
       * Confirming reads the object and decides whether the asset becomes usable.
       *
       * A `POST` to a sub-resource rather than a `PATCH` of the asset, because this is not
       * an edit: ADR-006 makes the record immutable in the sense that matters, and what
       * happens here is a one-way transition the caller cannot choose the outcome of.
       */
      .post("/:workspaceId/assets/:assetId/confirmation", async (c) => {
        const workspaceId = parseWorkspaceId(c.req.param("workspaceId"));
        const assetId = parseAssetId(c.req.param("assetId"));

        if (workspaceId === null || assetId === null) return c.json(notFound(), 404);

        const scope = { workspaceId, assetId, userId: c.var.user.id };
        const existing = await findAssetForMember(db, scope);

        if (existing === null) return c.json(notFound(), 404);

        // Already confirmed: answer with the asset rather than an error. The bytes cannot
        // have changed, so a client that retried a confirmation it never saw the response
        // to is asking a question that still has the same answer.
        if (assetIsReady(existing)) return c.json(toPayload(existing), 200);

        if (existing.status === "rejected") return c.json(unsupportedMedia(), 422);

        const inspection = await store.inspect({ key: existing.storageKey });

        // Nothing there yet. Unlike every other failure here this one fixes itself, so the
        // asset stays pending and the caller is told to come back.
        if (inspection === null) return c.json(uploadIncomplete(), 409);

        const actualContentType = detectImageContentType(inspection.leadingBytes);

        /*
         * The declared type has to be what the bytes are, not merely something allowed:
         * the object was stored with the declared type as its metadata, so accepting a
         * valid jpeg declared as png would serve jpeg bytes as png for the rest of its
         * life. The length is checked too — the signed url already pins it, but this is
         * the api's own answer rather than a trust in the signature.
         */
        const acceptable =
          actualContentType === existing.declaredContentType &&
          inspection.byteSize === existing.declaredByteSize;

        if (!acceptable) {
          await markAssetRejected(db, scope);

          return c.json(unsupportedMedia(), 422);
        }

        const ready = await markAssetReady(db, {
          ...scope,
          contentType: actualContentType,
          byteSize: inspection.byteSize,
          checksumSha256: inspection.checksumSha256,
        });

        if (ready !== null) return c.json(toPayload(ready), 200);

        /*
         * The transition matched no row, so something else moved it while this request was
         * reading the object. Re-read to say which: a concurrent confirmation reached the
         * same conclusion and its answer is as good as ours, while a rejection means the
         * asset is finished with.
         */
        const settled = await findAssetForMember(db, scope);

        if (settled === null) return c.json(notFound(), 404);
        if (assetIsReady(settled)) return c.json(toPayload(settled), 200);

        return c.json(unsupportedMedia(), 422);
      })
  );
}
