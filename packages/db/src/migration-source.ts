import { fileURLToPath } from "node:url";
import type { MigrationSource } from "./migrations.js";

/**
 * The business tables. Applied after Better Auth's source, which owns the `user`
 * rows these reference (ADR-007); the order is declared in `apps/api`, the lowest
 * place that can see both packages.
 *
 * Resolved relative to this module, which sits one level under the package root in
 * both `src` and `dist`.
 */
export const coreMigrationSource: MigrationSource = {
  name: "core",
  directory: fileURLToPath(new URL("../migrations", import.meta.url)),
};
