import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * The business tables, matching the SQL under `migrations/`.
 *
 * Better Auth's tables are described in `packages/auth`: ADR-007 keeps them on a
 * separate boundary, and nothing here references them through drizzle. The
 * foreign keys to `user` exist in SQL, where the database enforces them; they are
 * left off these definitions so `packages/db` does not need to know Better Auth's
 * schema to describe its own.
 */

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    isPersonal: boolean("is_personal").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The partial unique index sign-up provisioning relies on for idempotency.
    uniqueIndex("workspace_personal_owner_key").on(table.ownerUserId).where(sql`is_personal`),
    check("workspace_name_not_blank", sql`length(btrim(${table.name})) > 0`),
  ],
);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("workspace_member_workspace_id_user_id_unique").on(table.workspaceId, table.userId),
    index("workspace_member_user_id_idx").on(table.userId),
    check("workspace_member_role_known", sql`${table.role} in ('owner', 'editor', 'viewer')`),
  ],
);

export const creditAccount = pgTable(
  "credit_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspace.id, { onDelete: "cascade" }),
    // ADR-004: the append-only ledger that explains every change to these
    // arrives with the credits slice. Until then they stay at zero.
    availableCredits: bigint("available_credits", { mode: "number" }).notNull().default(0),
    reservedCredits: bigint("reserved_credits", { mode: "number" }).notNull().default(0),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("credit_account_available_not_negative", sql`${table.availableCredits} >= 0`),
    check("credit_account_reserved_not_negative", sql`${table.reservedCredits} >= 0`),
  ],
);

/** MVP writes only `owner`; the rest are reserved for team capability (§20.1). */
export const WORKSPACE_OWNER_ROLE = "owner";

/** §6.1: what a creator reuses across episodes. `migrations/0002_series.sql`. */
export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("series_workspace_id_created_at_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check("series_name_not_blank", sql`length(btrim(${table.name})) > 0`),
  ],
);

/** §20.2: the identity that stays put across a series' episodes. `migrations/0003_character.sql`. */
export const character = pgTable(
  "character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("character_series_id_created_at_idx").on(table.seriesId, table.createdAt, table.id),
    check("character_name_not_blank", sql`length(btrim(${table.name})) > 0`),
  ],
);

/**
 * §32.7: what the character looked like at a moment. An episode or shot locks one of
 * these, so improving a character never rewrites what already shipped.
 */
export const characterVersion = pgTable(
  "character_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    appearance: text("appearance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("character_version_character_id_version_unique").on(table.characterId, table.version),
    index("character_version_character_id_version_idx").on(table.characterId, table.version.desc()),
    check("character_version_positive", sql`${table.version} > 0`),
    check("character_version_appearance_not_blank", sql`length(btrim(${table.appearance})) > 0`),
  ],
);
