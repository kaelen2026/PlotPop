import { readFileSync } from "node:fs";
import { MINIMUM_PASSWORD_LENGTH } from "@plotpop/contracts";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { authSchema } from "./schema.js";

/**
 * Three descriptions of the same tables have to agree: Better Auth's core schema,
 * the drizzle definitions the adapter resolves fields against, and the SQL that
 * actually creates the columns. A mismatch between any two of them fails at
 * runtime, inside a sign-in, with a driver error that does not mention the cause.
 *
 * So this reads Better Auth's own declaration rather than a copy of it: a library
 * upgrade that adds a field fails here, which is the moment a migration is owed.
 */
const betterAuthTables = getAuthTables({ emailAndPassword: { enabled: true } });

const migration = readFileSync(
  new URL("../migrations/0001_better_auth_identity.sql", import.meta.url),
  "utf8",
);

/** Column names declared inside one `create table "name" ( ... );` block. */
function columnsInMigration(table: string): string[] {
  const start = migration.indexOf(`create table "${table}" (`);
  expect(start, `${table} is not created by the migration`).toBeGreaterThan(-1);

  const body = migration.slice(start, migration.indexOf("\n);", start));

  return [...body.matchAll(/^ {2}(\w+) /gm)].map((match) => match[1] as string);
}

function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const models = Object.keys(betterAuthTables) as (keyof typeof authSchema)[];

describe("better auth tables", () => {
  it("declares a drizzle table for every model Better Auth will ask for", () => {
    expect(Object.keys(authSchema).sort()).toEqual(models.sort());
  });

  it.each(models)("exposes every field Better Auth resolves on %s", (model) => {
    const fields = Object.keys(betterAuthTables[model]?.fields ?? {});
    // `id` is not part of the declared fields but every model has one.
    const expected = ["id", ...fields].sort();

    expect(Object.keys(getTableColumns(authSchema[model] as PgTable)).sort()).toEqual(expected);
  });

  it.each(models)("makes %s's required fields NOT NULL", (model) => {
    const columns = getTableColumns(authSchema[model] as PgTable);
    const required = Object.entries(betterAuthTables[model]?.fields ?? {})
      .filter(([, attribute]) => attribute.required !== false)
      .map(([field]) => field);

    for (const field of required) {
      expect(columns[field]?.notNull, `${model}.${field} must be NOT NULL`).toBe(true);
    }
  });

  it.each(models)("keeps %s's column names snake case, which is the whole mapping", (model) => {
    for (const [field, column] of Object.entries(getTableColumns(authSchema[model] as PgTable))) {
      expect(column.name).toBe(snakeCase(field));
    }
  });

  it.each(models)("creates exactly %s's drizzle columns in the migration", (model) => {
    const table = authSchema[model] as PgTable;
    const declared = Object.values(getTableColumns(table)).map((column) => column.name);

    expect(columnsInMigration(getTableConfig(table).name).sort()).toEqual(declared.sort());
  });
});

describe("password policy", () => {
  // Better Auth defaults to 8, so the api has to say otherwise. The shared
  // constant is what the web tier's form validates against too, so this pins the
  // one number both tiers read rather than a copy of it.
  it("configures Better Auth from the shared minimum length", () => {
    expect(MINIMUM_PASSWORD_LENGTH).toBe(12);
  });
});
