import { authMigrationSource } from "@plotpop/auth";
import { coreMigrationSource, type MigrationSource } from "@plotpop/db";

/**
 * Every migration boundary this database has, in the order they must be applied.
 *
 * ADR-007 keeps Better Auth's tables and the business tables on separate
 * boundaries inside one database, and the order is where the dependency between
 * them is stated: the business tables reference `user`.
 *
 * The list lives in the api rather than in `packages/db` because the api is the
 * lowest place that can see both packages — `packages/auth` depends on
 * `packages/db`, so `packages/db` cannot name the auth source.
 */
export const migrationSources: readonly MigrationSource[] = [
  authMigrationSource,
  coreMigrationSource,
];
