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
 * The business tables, matching `migrations/0001_workspace_and_credit_account.sql`.
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
