import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { asset, workspaceMember } from "./schema.js";
import type { WorkspaceScope } from "./series.js";

/**
 * Asset storage (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * The order of operations here is forced by §26: the browser uploads straight to object
 * storage, so a row has to name the object before the bytes exist. That makes an asset
 * the one record in this package written in two steps, and the second step conditional —
 * see `markAssetReady`.
 */

/** An asset row as the api reads it, at whatever point in its life it is. */
export type AssetRecord = {
  readonly id: string;
  readonly purpose: string;
  readonly status: "pending" | "ready" | "rejected";
  readonly storageKey: string;
  readonly declaredContentType: string;
  readonly declaredByteSize: number;
  /** Null until the bytes have been read; see `markAssetReady`. */
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly createdAt: Date;
};

const assetColumns = {
  id: asset.id,
  purpose: asset.purpose,
  status: asset.status,
  storageKey: asset.storageKey,
  declaredContentType: asset.declaredContentType,
  declaredByteSize: asset.declaredByteSize,
  contentType: asset.contentType,
  byteSize: asset.byteSize,
  checksumSha256: asset.checksumSha256,
  createdAt: asset.createdAt,
};

/*
 * §26 requires source material, intermediate output and exports to sit on separate paths
 * with separate lifecycle rules, so the prefix is a function of the purpose. Keeping the
 * mapping here means a retention rule can be written against a prefix and there is one
 * place to check what it will match.
 */
const STORAGE_PREFIX: Record<string, string> = {
  character_reference: "source",
};

export type AssetStorageKeyParts = {
  readonly purpose: string;
  readonly workspaceId: string;
  readonly id: string;
};

/**
 * Where an asset's bytes live.
 *
 * Derived entirely from ids. Nothing a client sent reaches this, which is what keeps a
 * filename — and therefore `../` — out of an object path, and what makes the path inherit
 * the unpredictability §20.4 requires of the id.
 */
export function assetStorageKey({ purpose, workspaceId, id }: AssetStorageKeyParts): string {
  const prefix = STORAGE_PREFIX[purpose];

  if (prefix === undefined) throw new Error(`No storage prefix is defined for purpose ${purpose}`);

  return `${prefix}/${workspaceId}/${id}`;
}

export type AssetDeclaration = WorkspaceScope & {
  readonly purpose: string;
  readonly declaredContentType: string;
  readonly declaredByteSize: number;
};

/**
 * Records an intended upload, or returns `null` if the caller is not a member of the
 * workspace they named.
 *
 * The membership test is in this function rather than in the route, so there is no
 * version of "reserve a storage key" that can be called without it, and the workspace id
 * written is the one the membership row returned rather than the one the caller passed.
 *
 * The id is generated here instead of by the column default so that the storage key can
 * be computed from it in the same statement: a key filled in by a follow-up update would
 * be a window in which a row points at nothing.
 */
export async function createPendingAsset(
  db: Database,
  declaration: AssetDeclaration,
): Promise<AssetRecord | null> {
  return db.transaction(async (tx) => {
    const membership = await tx
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, declaration.workspaceId),
          eq(workspaceMember.userId, declaration.userId),
        ),
      )
      .limit(1);

    const member = membership[0];

    if (member === undefined) return null;

    const id = randomUUID();
    const rows = await tx
      .insert(asset)
      .values({
        id,
        workspaceId: member.workspaceId,
        purpose: declaration.purpose,
        storageKey: assetStorageKey({
          purpose: declaration.purpose,
          workspaceId: member.workspaceId,
          id,
        }),
        declaredContentType: declaration.declaredContentType,
        declaredByteSize: declaration.declaredByteSize,
      })
      .returning(assetColumns);

    return (rows[0] as AssetRecord | undefined) ?? null;
  });
}

export type AssetScope = WorkspaceScope & {
  readonly assetId: string;
};

/**
 * Membership, workspace and asset id in one condition.
 *
 * Written once because every read and write below needs all three: an asset id paired
 * with the caller's own workspace must fail exactly as an unknown id does, and that
 * pairing is the mistake worth making impossible rather than merely wrong.
 */
function belongsToCaller(scope: AssetScope) {
  return and(
    eq(asset.id, scope.assetId),
    eq(asset.workspaceId, scope.workspaceId),
    eq(workspaceMember.userId, scope.userId),
  );
}

/** One asset, but only if it belongs to a workspace the caller is a member of. */
export async function findAssetForMember(
  db: Database,
  scope: AssetScope,
): Promise<AssetRecord | null> {
  const rows = await db
    .select(assetColumns)
    .from(asset)
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, asset.workspaceId))
    .where(belongsToCaller(scope))
    .limit(1);

  return (rows[0] as AssetRecord | undefined) ?? null;
}

/**
 * An asset whose bytes have been read.
 *
 * A separate type because `asset_ready_is_verified` in the migration makes the
 * combination "ready with nothing verified" unrepresentable in the database, and a caller
 * building a payload should not have to defend against a state the schema forbids.
 */
export type ReadyAssetRecord = AssetRecord & {
  readonly status: "ready";
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
};

/** Narrows a row to a usable asset, which is what every consumer of one actually wants. */
export function assetIsReady(record: AssetRecord): record is ReadyAssetRecord {
  return (
    record.status === "ready" &&
    record.contentType !== null &&
    record.byteSize !== null &&
    record.checksumSha256 !== null
  );
}

export type AssetVerification = AssetScope & {
  /** What the bytes actually are, which is not necessarily what was declared. */
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
};

/**
 * Moves an asset to `ready`, or returns `null` if it was not still `pending`.
 *
 * Conditional on the current status (§20.6), and that is what makes one upload write one
 * checksum: two confirmations racing, or a client retrying, means the second matches no
 * row rather than overwriting a digest something may already have recorded. It is also
 * why a rejected upload can never be revived — rejection leaves the status somewhere this
 * `where` cannot reach.
 *
 * A `null` therefore means "not pending any more", not "not found". The caller separates
 * the two by reading the row, which is what lets a repeated confirmation answer with the
 * asset instead of an error.
 */
export async function markAssetReady(
  db: Database,
  verification: AssetVerification,
): Promise<ReadyAssetRecord | null> {
  return db.transaction(async (tx) => {
    const reachable = tx
      .select({ id: asset.id })
      .from(asset)
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, asset.workspaceId))
      .where(belongsToCaller(verification));

    const rows = await tx
      .update(asset)
      .set({
        status: "ready",
        contentType: verification.contentType,
        byteSize: verification.byteSize,
        checksumSha256: verification.checksumSha256,
        confirmedAt: new Date(),
      })
      .where(and(eq(asset.status, "pending"), sql`${asset.id} in (${reachable})`))
      .returning(assetColumns);

    const updated = rows[0] as AssetRecord | undefined;

    if (updated === undefined) return null;

    /*
     * The statement above set all three verified columns, and `asset_ready_is_verified`
     * would have refused the write otherwise. The guard is here to carry that fact into
     * the type rather than to handle a case the database allows.
     */
    return assetIsReady(updated) ? updated : null;
  });
}

/**
 * Marks an upload unusable, and reports whether it was still `pending`.
 *
 * The same conditional shape as `markAssetReady`, and for the mirrored reason: a file we
 * read and refused must not become usable because something retried, so the two
 * transitions compete for the same `pending` status and only one of them can win.
 */
export async function markAssetRejected(db: Database, scope: AssetScope): Promise<boolean> {
  return db.transaction(async (tx) => {
    const reachable = tx
      .select({ id: asset.id })
      .from(asset)
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, asset.workspaceId))
      .where(belongsToCaller(scope));

    const rows = await tx
      .update(asset)
      .set({ status: "rejected" })
      .where(and(eq(asset.status, "pending"), sql`${asset.id} in (${reachable})`))
      .returning({ id: asset.id });

    return rows.length > 0;
  });
}
