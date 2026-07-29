import { z } from "zod";
import { type QualityTier, qualityTierSchema } from "./tiers.js";

/**
 * The harness reads its own environment.
 *
 * It deliberately does **not** go through `packages/config`. That package is the
 * startup contract of the three services (ADR-001), and a one-off experiment
 * credential has no business in the schema that the api and worker fail to boot
 * without. Nothing here is ever read by a service, and `.env.research` is a
 * separate, git-ignored file so the token never lands in the shared `.env`.
 *
 * Two rules are worth the code they cost:
 *
 * - A missing unit price is a hard failure, never a default. A guessed price
 *   produces a `unit-economics.md` that reads exactly like a measured one.
 * - A real provider needs a spend cap. §32.2 requires a confirmed ceiling before
 *   spending, and this run is unattended: a retry storm at three in the morning is
 *   the scenario the cap exists for.
 *
 * Every problem is reported at once. Discovering four missing variables one run at
 * a time is how an experiment gets started with the wrong price configured.
 */

export const providerIdSchema = z.enum(["fake", "replicate"]);

export type ProviderId = z.infer<typeof providerIdSchema>;

export const billableUnitSchema = z.enum([
  "output_second",
  "generated_frame",
  "request",
  "compute_second",
]);

export type BillableUnit = z.infer<typeof billableUnitSchema>;

export type HarnessConfig = {
  readonly provider: ProviderId;
  readonly apiToken: string | null;
  readonly baseUrl: string;
  readonly model: string | null;
  readonly tier: QualityTier;
  readonly billableUnit: BillableUnit;
  /** From the provider's price list, by hand. Never inferred. */
  readonly unitPriceUsd: number | null;
  readonly spendCapUsd: number | null;
  readonly runDir: string;
  readonly assetDir: string;
  readonly runId: string;
  readonly maxAttemptsPerShot: number;
  readonly concurrency: number;
  readonly pollIntervalMs: number;
  readonly attemptTimeoutMs: number;
};

const defaultBaseUrls: Readonly<Record<ProviderId, string>> = {
  fake: "http://localhost/offline",
  replicate: "https://api.replicate.com",
};

const positiveInt = (fallback: number, max: number) =>
  z.coerce.number().int().positive().max(max).default(fallback);

const shapeSchema = z.object({
  PLOTPOP_RESEARCH_PROVIDER: providerIdSchema.default("fake"),
  PLOTPOP_RESEARCH_API_TOKEN: z.string().min(1).optional(),
  PLOTPOP_RESEARCH_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  PLOTPOP_RESEARCH_MODEL: z.string().min(1).optional(),
  PLOTPOP_RESEARCH_TIER: qualityTierSchema.default("standard"),
  PLOTPOP_RESEARCH_BILLABLE_UNIT: billableUnitSchema.default("output_second"),
  PLOTPOP_RESEARCH_UNIT_PRICE_USD: z.coerce.number().nonnegative().optional(),
  PLOTPOP_RESEARCH_SPEND_CAP_USD: z.coerce.number().positive().optional(),
  PLOTPOP_RESEARCH_RUN_DIR: z.string().min(1).default("runs"),
  PLOTPOP_RESEARCH_ASSET_DIR: z.string().min(1).default("assets"),
  PLOTPOP_RESEARCH_RUN_ID: z.string().min(1).optional(),
  /**
   * Gate B's budget: the first generation plus at most three redos. A higher
   * ceiling would let a run pass a gate the gate does not allow.
   */
  PLOTPOP_RESEARCH_MAX_ATTEMPTS: positiveInt(4, 4),
  /** One by default: a rate limit costs a run more than serialising it does. */
  PLOTPOP_RESEARCH_CONCURRENCY: positiveInt(1, 4),
  PLOTPOP_RESEARCH_POLL_INTERVAL_MS: positiveInt(5_000, 60_000),
  PLOTPOP_RESEARCH_ATTEMPT_TIMEOUT_MS: positiveInt(900_000, 3_600_000),
});

/** Required only when the run can actually spend money. */
const requiredForRealProviders = [
  "PLOTPOP_RESEARCH_API_TOKEN",
  "PLOTPOP_RESEARCH_MODEL",
  "PLOTPOP_RESEARCH_UNIT_PRICE_USD",
  "PLOTPOP_RESEARCH_SPEND_CAP_USD",
] as const;

const whyRequired: Readonly<Record<(typeof requiredForRealProviders)[number], string>> = {
  PLOTPOP_RESEARCH_API_TOKEN: "the provider's api token",
  PLOTPOP_RESEARCH_MODEL: "the model or version to generate with",
  PLOTPOP_RESEARCH_UNIT_PRICE_USD:
    "the price per billable unit, copied from the provider's price list — the harness never guesses one",
  PLOTPOP_RESEARCH_SPEND_CAP_USD: "a hard ceiling for the whole run, in USD",
};

export function parseHarnessConfig(
  source: Readonly<Record<string, string | undefined>>,
  now: Date = new Date(),
): HarnessConfig {
  const parsed = shapeSchema.safeParse(source);

  if (!parsed.success) {
    // Only the variable names and the rule they broke: the token is in this object
    // and Zod's default rendering would print the value that failed beside it.
    const problems = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );

    throw new Error(`F-00 harness configuration is not usable:\n${problems.join("\n")}`);
  }

  const env = parsed.data;
  const provider = env.PLOTPOP_RESEARCH_PROVIDER;

  if (provider !== "fake") {
    const missing = requiredForRealProviders.filter((name) => env[name] === undefined);

    if (missing.length > 0) {
      throw new Error(
        [
          `Provider "${provider}" can spend real money, so it needs:`,
          ...missing.map((name) => `  - ${name}: ${whyRequired[name]}`),
          "",
          "Put them in scripts/research/.env.research, which is git-ignored, and",
          "see docs/research/provider-evaluation.md for what each one means.",
        ].join("\n"),
      );
    }
  }

  const day = now.toISOString().slice(0, 10);

  return {
    provider,
    apiToken: env.PLOTPOP_RESEARCH_API_TOKEN ?? null,
    baseUrl: env.PLOTPOP_RESEARCH_BASE_URL ?? defaultBaseUrls[provider],
    model: env.PLOTPOP_RESEARCH_MODEL ?? null,
    tier: env.PLOTPOP_RESEARCH_TIER,
    billableUnit: env.PLOTPOP_RESEARCH_BILLABLE_UNIT,
    unitPriceUsd: env.PLOTPOP_RESEARCH_UNIT_PRICE_USD ?? null,
    spendCapUsd: env.PLOTPOP_RESEARCH_SPEND_CAP_USD ?? null,
    runDir: env.PLOTPOP_RESEARCH_RUN_DIR,
    assetDir: env.PLOTPOP_RESEARCH_ASSET_DIR,
    runId: env.PLOTPOP_RESEARCH_RUN_ID ?? `${day}-${provider}-${env.PLOTPOP_RESEARCH_TIER}`,
    maxAttemptsPerShot: env.PLOTPOP_RESEARCH_MAX_ATTEMPTS,
    concurrency: env.PLOTPOP_RESEARCH_CONCURRENCY,
    pollIntervalMs: env.PLOTPOP_RESEARCH_POLL_INTERVAL_MS,
    attemptTimeoutMs: env.PLOTPOP_RESEARCH_ATTEMPT_TIMEOUT_MS,
  };
}
