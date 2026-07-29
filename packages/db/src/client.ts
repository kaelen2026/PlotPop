import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The handle every server-side caller shares.
 *
 * Deliberately not parameterised by a schema object: the relational query API
 * (`db.query.*`) is the only thing that needs one, and the core query builder
 * takes tables directly. Keeping the type free of a schema generic means adding
 * a table never changes the type every repository is written against.
 */
export type Database = NodePgDatabase & { $client: Pool };

export type DatabaseOptions = {
  readonly url: string;
  /**
   * Connections held per process. The api and worker each run several replicas
   * against one Postgres, so the ceiling is a deployment concern rather than a
   * per-call one.
   */
  readonly maxConnections?: number;
};

export function createDatabase({ url, maxConnections = 10 }: DatabaseOptions): Database {
  const pool = new Pool({ connectionString: url, max: maxConnections });

  return drizzle({ client: pool });
}

/** Ends the pool so a test run or a graceful shutdown does not hang on an idle socket. */
export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end();
}
