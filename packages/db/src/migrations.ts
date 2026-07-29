import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";
import type { Database } from "./client.js";

/*
 * Migrations are plain forward-only SQL files applied by this runner.
 *
 * Why not `drizzle-kit generate` plus `drizzle-orm`'s migrator: ADR-007 requires
 * Better Auth's tables and the business tables to keep separate migration
 * boundaries, so the ledger is keyed by source and the sources are applied in a
 * declared order. Hand written SQL also states partial unique indexes and CHECK
 * constraints exactly as intended — `docs/implementation-plan.md` §2 puts those
 * constraints in the database rather than in Zod, so they are worth writing out
 * rather than round-tripping through a snapshot the CLI owns.
 *
 * The naming convention, which the parser below enforces:
 *
 *   <4-digit version>_<lower_snake_case_description>.sql
 *
 * - Versions are unique inside a source and applied in ascending order.
 * - An applied file is immutable: its checksum is recorded and re-verified, so
 *   editing history fails the run instead of drifting environments apart.
 * - No down migrations. A mistake is corrected by a new forward migration, which
 *   is the only kind that can be rolled out and rolled back safely.
 * - Each file must be applicable inside one transaction and must be backward
 *   compatible with the previous application version (`.claude/rules/workflow.md`
 *   §2), so a migration and a deploy can proceed independently.
 */

const MIGRATION_FILE_NAME = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

const LEDGER_TABLE = "schema_migration";

/**
 * Serialises migration runs across replicas. A session-scoped advisory lock is
 * released when the connection closes, so a crashed migrator does not leave the
 * next deploy waiting on a lock nobody holds.
 */
const LOCK_KEY = 4_170_233_501;

export type MigrationFile = {
  readonly version: string;
  readonly name: string;
  readonly fileName: string;
};

/** One migration boundary with its own ledger namespace, applied in array order. */
export type MigrationSource = {
  readonly name: string;
  readonly directory: string;
};

export type AppliedMigration = {
  readonly source: string;
  readonly version: string;
  readonly name: string;
};

export type MigrationFailureReason =
  | "invalid_file_name"
  | "duplicate_version"
  | "out_of_order"
  | "checksum_mismatch";

export class MigrationError extends Error {
  override readonly name = "MigrationError";

  constructor(
    readonly reason: MigrationFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export function parseMigrationFileName(fileName: string): MigrationFile {
  const match = MIGRATION_FILE_NAME.exec(fileName);

  if (!match) {
    throw new MigrationError(
      "invalid_file_name",
      `${fileName} is not a migration file name: expected <0000>_<lower_snake_case>.sql`,
    );
  }

  return { version: match[1] as string, name: match[2] as string, fileName };
}

/** Reads a source's migrations in ascending version order. */
export async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory);
  const files = entries.filter((entry) => !entry.startsWith(".")).map(parseMigrationFileName);
  const seen = new Set<string>();

  for (const file of files) {
    if (seen.has(file.version)) {
      throw new MigrationError(
        "duplicate_version",
        `two migrations claim version ${file.version} in ${directory}`,
      );
    }
    seen.add(file.version);
  }

  return files.sort((left, right) => left.version.localeCompare(right.version));
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Statements are sent through a checked-out connection rather than `db.execute`:
 * a migration file holds several statements, and node-postgres only allows that
 * on the simple query protocol, which it uses when a query carries no parameters.
 *
 * Every statement in a run shares the one connection the run holds. Reaching back
 * into the pool for a second one deadlocks a single-connection pool, which is
 * exactly the pool a release step opens.
 */
async function ensureLedger(connection: PoolClient): Promise<void> {
  await connection.query(`
    create table if not exists ${LEDGER_TABLE} (
      source text not null,
      version text not null,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now(),
      primary key (source, version)
    )
  `);
}

type LedgerRow = { version: string; checksum: string };

/**
 * Applies every source in the order given, and returns what this call added.
 *
 * Sources are ordered rather than independent because the business tables
 * reference Better Auth's `user`: separate boundaries still share one database
 * (ADR-007), and the order is where that dependency is stated.
 */
export async function applyMigrations(
  db: Database,
  sources: readonly MigrationSource[],
): Promise<AppliedMigration[]> {
  const connection = await db.$client.connect();
  const applied: AppliedMigration[] = [];

  try {
    await connection.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureLedger(connection);

    for (const source of sources) {
      const files = await readMigrationFiles(source.directory);
      const { rows } = await connection.query<LedgerRow>(
        `select version, checksum from ${LEDGER_TABLE} where source = $1`,
        [source.name],
      );
      const ledger = new Map(rows.map((row) => [row.version, row.checksum]));
      const highestApplied = [...ledger.keys()].sort().at(-1);

      for (const file of files) {
        const sql = await readFile(join(source.directory, file.fileName), "utf8");
        const digest = checksum(sql);
        const recorded = ledger.get(file.version);

        if (recorded !== undefined) {
          if (recorded !== digest) {
            throw new MigrationError(
              "checksum_mismatch",
              `${source.name}/${file.fileName} changed after it was applied`,
            );
          }
          continue;
        }

        // A new file numbered below one already applied means two branches both
        // claimed a number. Applying it would give environments different
        // histories under the same versions, so the run stops.
        if (highestApplied !== undefined && file.version <= highestApplied) {
          throw new MigrationError(
            "out_of_order",
            `${source.name}/${file.fileName} is numbered below the applied ${highestApplied}; renumber it`,
          );
        }

        await connection.query("begin");
        try {
          await connection.query(sql);
          await connection.query(
            `insert into ${LEDGER_TABLE} (source, version, name, checksum) values ($1, $2, $3, $4)`,
            [source.name, file.version, file.name, digest],
          );
          await connection.query("commit");
        } catch (error) {
          await connection.query("rollback");
          throw error;
        }

        applied.push({ source: source.name, version: file.version, name: file.name });
      }
    }

    return applied;
  } finally {
    await connection.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    connection.release();
  }
}
