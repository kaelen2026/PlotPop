import { logLevelSchema, type ServiceName } from "@plotpop/contracts";
import { z } from "zod";

/** A raw environment, normally `process.env`. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export const runtimeModeSchema = z.enum(["development", "test", "production"]);

export type RuntimeMode = z.infer<typeof runtimeModeSchema>;

const portSchema = z.coerce.number().int().min(1).max(65_535);
const requiredText = z.string().min(1);

// The protocol is constrained on purpose: a `DATABASE_URL` that parses as a URL
// but points at the wrong kind of server fails much later, inside a driver, with
// an error that no longer mentions configuration.
const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });
const redisUrlSchema = z.url({ protocol: /^rediss?$/ });
const httpUrlSchema = z.url({ protocol: /^https?$/ });

const processFields = {
  NODE_ENV: runtimeModeSchema.default("development"),
  LOG_LEVEL: logLevelSchema.default("info"),
};

/**
 * Backing services the api and worker both hold connections to. The web tier
 * deliberately has no counterpart: it reaches all of this through the api
 * (ADR-001).
 */
const backingServiceSchema = z.object({
  ...processFields,
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
  STORAGE_ENDPOINT: httpUrlSchema,
  STORAGE_REGION: requiredText.default("us-east-1"),
  STORAGE_BUCKET: requiredText,
  STORAGE_ACCESS_KEY_ID: requiredText,
  STORAGE_SECRET_ACCESS_KEY: requiredText,
});

/**
 * The api and worker read the same backing services but bind their own port
 * variable, so one local environment file can drive `pnpm dev` for both.
 */
function toBackendConfig(env: z.infer<typeof backingServiceSchema>, port: number) {
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port,
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    storage: {
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    },
  };
}

const apiEnvSchema = backingServiceSchema
  .extend({ API_PORT: portSchema.default(3001) })
  .transform((env) => toBackendConfig(env, env.API_PORT));

const workerEnvSchema = backingServiceSchema
  .extend({ WORKER_PORT: portSchema.default(3002) })
  .transform((env) => toBackendConfig(env, env.WORKER_PORT));

const webEnvSchema = z
  .object({
    ...processFields,
    API_BASE_URL: httpUrlSchema,
  })
  .transform((env) => ({
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    apiBaseUrl: env.API_BASE_URL,
  }));

export type ApiConfig = z.infer<typeof apiEnvSchema>;
export type WorkerConfig = z.infer<typeof workerEnvSchema>;
export type WebConfig = z.infer<typeof webEnvSchema>;

export type EnvironmentIssue = {
  readonly variable: string;
  readonly problem: string;
};

/**
 * Raised once, at startup, listing every variable that is wrong.
 *
 * The message quotes variable names and Zod's own descriptions, never a value:
 * connection strings carry passwords, and a startup failure is exactly the kind
 * of thing that ends up pasted into an issue tracker.
 */
export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError";

  constructor(
    readonly service: ServiceName,
    readonly issues: readonly EnvironmentIssue[],
  ) {
    const detail = issues.map((issue) => `  - ${issue.variable}: ${issue.problem}`).join("\n");
    super(`Invalid environment for ${service}:\n${detail}`);
  }
}

/** Drops absent and blank variables so a `KEY=` line in a `.env` file falls back to its default. */
function present(source: EnvironmentSource): Record<string, string> {
  const entries = Object.entries(source).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1].trim() !== "",
  );

  return Object.fromEntries(entries);
}

function describeIssues(error: z.ZodError, supplied: Record<string, string>): EnvironmentIssue[] {
  const firstPerVariable = new Map<string, string>();

  for (const issue of error.issues) {
    const variable = issue.path.map(String).join(".") || "(environment)";
    if (firstPerVariable.has(variable)) continue;
    firstPerVariable.set(variable, variable in supplied ? issue.message : "required but not set");
  }

  return [...firstPerVariable]
    .map(([variable, problem]) => ({ variable, problem }))
    .sort((left, right) => left.variable.localeCompare(right.variable));
}

function createEnvParser<Config>(service: ServiceName, schema: z.ZodType<Config>) {
  return (source: EnvironmentSource = process.env): Config => {
    const supplied = present(source);
    const result = schema.safeParse(supplied);

    if (!result.success) {
      throw new EnvironmentError(service, describeIssues(result.error, supplied));
    }

    return result.data;
  };
}

export const parseApiEnv = createEnvParser<ApiConfig>("api", apiEnvSchema);
export const parseWorkerEnv = createEnvParser<WorkerConfig>("worker", workerEnvSchema);
export const parseWebEnv = createEnvParser<WebConfig>("web", webEnvSchema);
