import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { coreMigrationSource } from "./migration-source.js";
import { applyMigrations } from "./migrations.js";
import { creditAccount, workspace, workspaceMember } from "./schema.js";
import { identityFixtureSource } from "./testing/identity.js";
import { createTestDatabase, type TestDatabase } from "./testing/temp-database.js";
import { provisionDefaultWorkspace, type WorkspaceOwner } from "./workspaces.js";

/**
 * `docs/ai-comic-drama-saas-design.md` §19: a user who signs up gets a default
 * workspace and a credit account through an idempotent flow.
 *
 * `.claude/rules/tdd.md` §3 requires idempotency to be pinned before the
 * implementation exists, because a second workspace is not an error anyone sees —
 * it is a user whose series quietly live somewhere they cannot reach.
 *
 * The `user` table these tables reference belongs to Better Auth's migration
 * boundary (ADR-007), so `identityFixtureSource` stands up the only part of it this
 * package depends on. Applying both real sources in order is the api's test, since
 * the api is what owns their order.
 */
async function migratedDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  await applyMigrations(database.db, [await identityFixtureSource(), coreMigrationSource]);

  return database;
}

describe("default workspace provisioning", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await migratedDatabase();
  });

  afterEach(async () => {
    // Cascades reach workspace, workspace_member and credit_account.
    await database.db.$client.query('delete from "user"');
  });

  afterAll(async () => {
    await database.drop();
  });

  /** Creates the Better Auth row the workspace references, and the owner to pass in. */
  async function createUser(id: string, name: string): Promise<WorkspaceOwner> {
    const email = `${id}@plotpop.test`;
    await database.db.$client.query('insert into "user" (id, name, email) values ($1, $2, $3)', [
      id,
      name,
      email,
    ]);

    return { userId: id, name, email };
  }

  it("creates a workspace named after its owner, with an owner membership", async () => {
    const nia = await createUser("user-nia", "Nia");

    const provisioned = await provisionDefaultWorkspace(database.db, nia);

    expect(provisioned).toMatchObject({ name: "Nia", ownerUserId: "user-nia", revision: 1 });

    const members = await database.db.select().from(workspaceMember);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      workspaceId: provisioned.id,
      userId: "user-nia",
      role: "owner",
    });
  });

  it("opens the credit account empty, with nothing reserved", async () => {
    const ravi = await createUser("user-ravi", "Ravi");

    const provisioned = await provisionDefaultWorkspace(database.db, ravi);

    const accounts = await database.db.select().from(creditAccount);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      workspaceId: provisioned.id,
      availableCredits: 0,
      reservedCredits: 0,
    });
  });

  it("returns the same workspace when provisioning runs again for the same user", async () => {
    const mika = await createUser("user-mika", "Mika");

    const first = await provisionDefaultWorkspace(database.db, mika);
    const second = await provisionDefaultWorkspace(database.db, mika);

    expect(second.id).toBe(first.id);
    expect(await database.db.select().from(workspace)).toHaveLength(1);
    expect(await database.db.select().from(creditAccount)).toHaveLength(1);
    expect(await database.db.select().from(workspaceMember)).toHaveLength(1);
  });

  // Two requests can land on two api replicas at once. The partial unique index is
  // what settles it; without one, both would insert and a user would end up with
  // two workspaces.
  it("produces one workspace when provisioning attempts race", async () => {
    const tam = await createUser("user-tam", "Tam");

    const attempts = await Promise.all([
      provisionDefaultWorkspace(database.db, tam),
      provisionDefaultWorkspace(database.db, tam),
      provisionDefaultWorkspace(database.db, tam),
    ]);

    expect(new Set(attempts.map((entry) => entry.id)).size).toBe(1);
    expect(await database.db.select().from(workspace)).toHaveLength(1);
    expect(await database.db.select().from(creditAccount)).toHaveLength(1);
  });

  it("keeps each user's workspace separate", async () => {
    const odile = await provisionDefaultWorkspace(
      database.db,
      await createUser("user-odile", "Odile"),
    );
    const sun = await provisionDefaultWorkspace(database.db, await createUser("user-sun", "Sun"));

    expect(odile.id).not.toBe(sun.id);
    expect(await database.db.select().from(workspace)).toHaveLength(2);
  });

  it("falls back to the address's local part when the display name is blank", async () => {
    const blank = await createUser("user-blank", "   ");

    const provisioned = await provisionDefaultWorkspace(database.db, blank);

    // `workspace.name` rejects a blank string, so without a fallback provisioning
    // would fail on a user Better Auth was happy to create.
    expect(provisioned.name).toBe("user-blank");
  });
});

describe("credit account constraints", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await migratedDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  async function workspaceFor(owner: string): Promise<string> {
    await database.db.$client.query('insert into "user" (id, name, email) values ($1, $1, $2)', [
      owner,
      `${owner}@plotpop.test`,
    ]);
    const { rows } = await database.db.$client.query<{ id: string }>(
      "insert into workspace (owner_user_id, name) values ($1, $1) returning id",
      [owner],
    );

    return rows[0]?.id as string;
  }

  // ADR-004 forbids negative balances. `docs/implementation-plan.md` §2 puts that
  // in the database rather than a Zod schema, so it holds against any writer.
  it.each(["available_credits", "reserved_credits"])(
    "refuses a negative %s balance",
    async (column) => {
      const workspaceId = await workspaceFor(`neg-${column}`);

      await expect(
        database.db.$client.query(
          `insert into credit_account (workspace_id, ${column}) values ($1, -1)`,
          [workspaceId],
        ),
      ).rejects.toThrow(/violates check constraint/);
    },
  );

  it("refuses a second credit account for the same workspace", async () => {
    const workspaceId = await workspaceFor("dup-account");
    await database.db.$client.query("insert into credit_account (workspace_id) values ($1)", [
      workspaceId,
    ]);

    await expect(
      database.db.$client.query("insert into credit_account (workspace_id) values ($1)", [
        workspaceId,
      ]),
    ).rejects.toThrow(/duplicate key value/);
  });

  it("refuses a workspace whose owner is not a user", async () => {
    await expect(
      database.db.$client.query("insert into workspace (owner_user_id, name) values ($1, $1)", [
        "nobody",
      ]),
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it("refuses a blank workspace name", async () => {
    await database.db.$client.query('insert into "user" (id, name, email) values ($1, $1, $2)', [
      "blank-name",
      "blank-name@plotpop.test",
    ]);

    await expect(
      database.db.$client.query("insert into workspace (owner_user_id, name) values ($1, '  ')", [
        "blank-name",
      ]),
    ).rejects.toThrow(/violates check constraint/);
  });
});
