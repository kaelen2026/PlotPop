import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MigrationSource } from "../migrations.js";

/**
 * Stands up the one part of Better Auth's schema the business tables depend on.
 *
 * ADR-007 keeps `user` on its own migration boundary, and `packages/db` cannot
 * name that boundary — `packages/auth` depends on this package, not the other way
 * around. So a test here brings up a text primary key and nothing else. Applying
 * both real sources in their real order is the api's test, because the api is what
 * owns the order (`apps/api/src/migrations.ts`).
 */
export async function identityFixtureSource(): Promise<MigrationSource> {
  const directory = await mkdtemp(join(tmpdir(), "plotpop-identity-"));

  await writeFile(
    join(directory, "0001_user.sql"),
    'create table "user" (id text primary key, name text not null, email text not null unique);',
    "utf8",
  );

  return { name: "auth", directory };
}
