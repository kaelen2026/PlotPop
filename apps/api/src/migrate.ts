import { parseApiEnv } from "@plotpop/config";
import { applyMigrations, closeDatabase, createDatabase } from "@plotpop/db";
import { createLogger } from "@plotpop/observability";
import { migrationSources } from "./migrations.js";

/**
 * Applies pending migrations and exits. Run as `pnpm db:migrate` locally, and as
 * a release step before rolling out new instances — never from a serving process,
 * so a deploy that fails to migrate does not also take the api down with it.
 */
const config = parseApiEnv();
const logger = createLogger({ service: "api", level: config.logLevel });
const db = createDatabase({ url: config.database.url, maxConnections: 1 });

try {
  const applied = await applyMigrations(db, migrationSources);

  logger.info("migrations applied", {
    count: applied.length,
    migrations: applied.map((entry) => `${entry.source}/${entry.version}_${entry.name}`),
  });
} catch (error) {
  logger.error("migrations failed", { error });
  process.exitCode = 1;
} finally {
  await closeDatabase(db);
}
