import { z } from "zod";

/**
 * Ordered from most to least verbose. Both the environment schema in
 * `packages/config` and the logger in `packages/observability` read this order,
 * so a threshold means the same thing wherever it is configured or compared.
 */
export const logLevels = ["debug", "info", "warn", "error"] as const;

export const logLevelSchema = z.enum(logLevels);

export type LogLevel = z.infer<typeof logLevelSchema>;
