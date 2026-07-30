import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assetStorageKey,
  createPendingAsset,
  findAssetForMember,
  markAssetReady,
  markAssetRejected,
} from "./assets.js";
import { coreMigrationSource } from "./migration-source.js";
import { applyMigrations } from "./migrations.js";
import { WORKSPACE_OWNER_ROLE } from "./schema.js";
import { identityFixtureSource } from "./testing/identity.js";
import { createTestDatabase, type TestDatabase } from "./testing/temp-database.js";

/**
 * Asset storage (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * Two things are pinned here. An asset row exists before its bytes do, and the
 * transition to `ready` is conditional (§20.6) — so two confirmations of one upload
 * cannot both write a checksum, and a rejected upload can never quietly become usable.
 *
 * And what makes the record immutable in ADR-006's sense is that the storage key and
 * the checksum are written once. Replacing a file means a new asset, because an export
 * that recorded this one has to keep finding these bytes.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  await applyMigrations(database.db, [await identityFixtureSource(), coreMigrationSource]);
});

afterEach(async () => {
  // Cascades reach workspace and asset.
  await database.db.$client.query('delete from "user"');
});

afterAll(async () => {
  await database.drop();
});

type Member = { readonly userId: string; readonly workspaceId: string };

async function createMember(label: string): Promise<Member> {
  const client = database.db.$client;

  await client.query('insert into "user" (id, name, email) values ($1, $1, $2)', [
    label,
    `${label}@plotpop.test`,
  ]);
  const { rows } = await client.query<{ id: string }>(
    "insert into workspace (owner_user_id, name) values ($1, $1) returning id",
    [label],
  );
  const workspaceId = rows[0]?.id as string;

  await client.query(
    "insert into workspace_member (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, label, WORKSPACE_OWNER_ROLE],
  );

  return { userId: label, workspaceId };
}

const DECLARED = {
  purpose: "character_reference",
  declaredContentType: "image/png",
  declaredByteSize: 40_512,
} as const;

const VERIFIED = {
  contentType: "image/png",
  byteSize: 40_512,
  checksumSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
} as const;

async function pendingAsset(member: Member) {
  const created = await createPendingAsset(database.db, { ...member, ...DECLARED });

  if (created === null) throw new Error("expected the pending asset to be created");

  return created;
}

describe("creating a pending asset", () => {
  it("records what was declared and where the bytes will go", async () => {
    const member = await createMember("nia");
    const asset = await pendingAsset(member);

    expect(asset).toMatchObject({
      status: "pending",
      purpose: "character_reference",
      declaredContentType: "image/png",
      declaredByteSize: 40_512,
    });
    // Derived from ids, never from anything the caller sent: §20.4 keeps volume and
    // ordering out of public identifiers, and a supplied name is how "../" gets in.
    expect(asset.storageKey).toBe(
      assetStorageKey({
        purpose: "character_reference",
        workspaceId: member.workspaceId,
        id: asset.id,
      }),
    );
  });

  it("has nothing verified about it yet", async () => {
    const member = await createMember("nia");
    const asset = await pendingAsset(member);

    expect(asset.contentType).toBeNull();
    expect(asset.byteSize).toBeNull();
    expect(asset.checksumSha256).toBeNull();
  });

  it("stores nothing for a workspace the caller is not a member of", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");

    const created = await createPendingAsset(database.db, {
      workspaceId: ravi.workspaceId,
      userId: nia.userId,
      ...DECLARED,
    });

    expect(created).toBeNull();
    const { rows } = await database.db.$client.query("select count(*)::int as total from asset");
    expect(rows[0]?.total).toBe(0);
  });

  it("records that the creator confirmed their right to use the file", async () => {
    // §195, §733: the upload flow has to ask, and a claim nobody stored is a claim
    // nobody made.
    const member = await createMember("nia");
    const asset = await pendingAsset(member);

    const { rows } = await database.db.$client.query<{ at: Date | null }>(
      "select rights_confirmed_at as at from asset where id = $1",
      [asset.id],
    );

    expect(rows[0]?.at).toBeInstanceOf(Date);
  });
});

describe("confirming an upload", () => {
  it("moves the asset to ready with what the bytes turned out to be", async () => {
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    const ready = await markAssetReady(database.db, {
      ...member,
      assetId: pending.id,
      ...VERIFIED,
    });

    expect(ready).toMatchObject({ status: "ready", ...VERIFIED });
    // The key never moves: it is what an export recorded (ADR-006).
    expect(ready?.storageKey).toBe(pending.storageKey);
  });

  it("refuses to be applied twice, so one upload writes one checksum", async () => {
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    await markAssetReady(database.db, { ...member, assetId: pending.id, ...VERIFIED });

    // The transition is conditional on `pending` (§20.6). A second confirmation — two
    // requests racing, or a client retrying — matches no row rather than overwriting a
    // checksum that something may already have recorded.
    const again = await markAssetReady(database.db, {
      ...member,
      assetId: pending.id,
      contentType: "image/jpeg",
      byteSize: 1,
      checksumSha256: "0".repeat(64),
    });

    expect(again).toBeNull();
    const stored = await findAssetForMember(database.db, { ...member, assetId: pending.id });
    expect(stored).toMatchObject({ status: "ready", ...VERIFIED });
  });

  it("cannot be applied to an asset in someone else's workspace", async () => {
    const nia = await createMember("nia");
    const ravi = await createMember("ravi");
    const pending = await pendingAsset(ravi);

    const stolen = await markAssetReady(database.db, {
      workspaceId: ravi.workspaceId,
      userId: nia.userId,
      assetId: pending.id,
      ...VERIFIED,
    });

    expect(stolen).toBeNull();
    // Naming their own workspace with someone else's asset id fails the same way.
    const mismatched = await markAssetReady(database.db, {
      workspaceId: nia.workspaceId,
      userId: nia.userId,
      assetId: pending.id,
      ...VERIFIED,
    });

    expect(mismatched).toBeNull();
    expect(await findAssetForMember(database.db, { ...ravi, assetId: pending.id })).toMatchObject({
      status: "pending",
    });
  });

  it("leaves a rejected upload unusable for good", async () => {
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    expect(await markAssetRejected(database.db, { ...member, assetId: pending.id })).toBe(true);

    // Rejection is also conditional on `pending`, so a late confirmation of the same
    // upload cannot revive it. Otherwise a file we read and refused becomes readable by
    // whatever retries hardest.
    expect(
      await markAssetReady(database.db, { ...member, assetId: pending.id, ...VERIFIED }),
    ).toBeNull();
    expect(await findAssetForMember(database.db, { ...member, assetId: pending.id })).toMatchObject(
      {
        status: "rejected",
      },
    );
  });
});

describe("the database's own guarantees", () => {
  it("refuses a ready asset with nothing verified about it", async () => {
    // Not a Zod concern: `docs/implementation-plan.md` §2 keeps integrity in the
    // database, so "ready but never read" has to be unrepresentable even to a writer
    // that bypasses this package.
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    await expect(
      database.db.$client.query("update asset set status = 'ready' where id = $1", [pending.id]),
    ).rejects.toThrow(/asset_ready_is_verified/);
  });

  it("refuses two assets pointing at the same object", async () => {
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    await expect(
      database.db.$client.query(
        `insert into asset (workspace_id, purpose, storage_key, declared_content_type, declared_byte_size)
         values ($1, $2, $3, $4, $5)`,
        [member.workspaceId, "character_reference", pending.storageKey, "image/png", 1],
      ),
    ).rejects.toThrow(/asset_storage_key/);
  });

  it("refuses a checksum that is not a sha-256 digest", async () => {
    const member = await createMember("nia");
    const pending = await pendingAsset(member);

    await expect(
      database.db.$client.query(
        `update asset set status = 'ready', content_type = 'image/png', byte_size = 1,
           checksum_sha256 = 'NOT-A-DIGEST', confirmed_at = now() where id = $1`,
        [pending.id],
      ),
    ).rejects.toThrow(/asset_checksum_sha256_format/);
  });
});
