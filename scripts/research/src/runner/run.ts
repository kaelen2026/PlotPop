import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HarnessConfig } from "../config.js";
import { backoffDelayMs, classifyFailure, retryDispositionOf } from "../failures.js";
import type { MediaFacts } from "../media/ffprobe.js";
import type { ExperimentProvider } from "../providers/adapter.js";
import { renderShotRequest } from "../providers/prompt.js";
import { resolveUsage } from "../providers/usage.js";
import {
  type AttemptRecord,
  attemptIdempotencyKey,
  attemptRecordSchema,
} from "../records/attempt.js";
import type { AttemptLog } from "../records/log.js";
import type { TestSeries, TestShot } from "../testset/schema.js";
import { describeTierDrift, tierRequests } from "../tiers.js";
import { decideShotAction } from "./decide.js";

/**
 * Walks the frozen test set once, generating what still needs generating.
 *
 * Glue, deliberately thin: every judgement it makes lives in a tested function
 * elsewhere — `decideShotAction` for what to do, `classifyFailure` for what went
 * wrong, `resolveUsage` for what it cost, `describeTierDrift` for whether the tier
 * promise held.
 *
 * The spend cap is honoured the way ADR-004 honours credits: the estimate is
 * *reserved* before the request and settled to the real figure afterwards. A run
 * therefore cannot cross its cap even if a later attempt turns out dearer than
 * estimated, and it cannot strand budget either.
 */

export const generateOperation = "generate_shot_video";

export type MediaProbe = (filePath: string) => Promise<MediaFacts>;

export type RunnerDeps = {
  readonly provider: ExperimentProvider;
  readonly probe: MediaProbe;
  readonly log: AttemptLog;
  readonly report: (message: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly random: () => number;
};

export type RunOptions = {
  /** Restrict the run to these shot ids. Use it to buy one shot before thirty. */
  readonly onlyShotIds?: readonly string[];
};

export type RunOutcome = {
  readonly generated: number;
  readonly skipped: number;
  readonly settledUsd: number;
  readonly stoppedEarly: boolean;
};

export async function runExperiment(
  config: HarnessConfig,
  series: TestSeries,
  deps: RunnerDeps,
  options: RunOptions = {},
): Promise<RunOutcome> {
  const tier = tierRequests[config.tier];
  const outputRoot = join(config.runDir, config.runId);
  const shots = series.shots.filter(
    (shot) => options.onlyShotIds === undefined || options.onlyShotIds.includes(shot.id),
  );

  if (options.onlyShotIds !== undefined && shots.length !== options.onlyShotIds.length) {
    const known = new Set(series.shots.map((shot) => shot.id));
    const unknown = options.onlyShotIds.filter((shotId) => !known.has(shotId));

    throw new Error(`the frozen test set has no ${unknown.join(", ")}`);
  }

  // The estimate a single attempt is charged against the cap before it runs.
  const estimatePerAttempt =
    config.unitPriceUsd === null ? 0 : config.unitPriceUsd * tier.maxShotSeconds;

  let settledUsd = (await deps.log.all()).reduce(
    (total, record) => total + (record.usage?.costUsd ?? 0),
    0,
  );
  let generated = 0;
  let skipped = 0;

  for (const shot of shots) {
    for (;;) {
      const attempts = await deps.log.all();
      const decision = decideShotAction({
        shotId: shot.id,
        attempts,
        maxAttemptsPerShot: config.maxAttemptsPerShot,
        spentUsd: settledUsd,
        spendCapUsd: config.spendCapUsd,
        estimatedNextCostUsd: estimatePerAttempt,
      });

      if (decision.action === "stop") {
        deps.report(
          `stopping: the next attempt would pass the ${config.spendCapUsd} USD cap ` +
            `(${settledUsd.toFixed(4)} spent so far)`,
        );

        return { generated, skipped, settledUsd, stoppedEarly: true };
      }

      if (decision.action === "skip") {
        deps.report(`${shot.id}: ${decision.reason}`);
        skipped += 1;
        break;
      }

      const record = await attemptOnce({
        config,
        series,
        shot,
        tier,
        attemptNumber: decision.attemptNumber,
        outputRoot,
        deps,
      });

      await deps.log.append(record);
      settledUsd += record.usage?.costUsd ?? 0;
      generated += 1;

      deps.report(
        `${shot.id} attempt ${record.attemptNumber}: ${record.outcome}` +
          (record.failure === null ? "" : ` (${record.failure.failureClass})`) +
          ` in ${(record.latencyMs.total / 1000).toFixed(1)}s` +
          (record.usage === null ? "" : ` for ${record.usage.costUsd.toFixed(4)} USD`),
      );

      if (record.outcome === "succeeded") break;

      const disposition =
        record.failure === null ? "do_not_retry" : retryDispositionOf(record.failure.failureClass);

      if (disposition !== "retry_with_backoff") break;

      await deps.sleep(
        backoffDelayMs(record.attemptNumber, {
          baseMs: config.pollIntervalMs,
          maxMs: 60_000,
          random: deps.random,
        }),
      );
    }
  }

  return { generated, skipped, settledUsd, stoppedEarly: false };
}

type AttemptContext = {
  config: HarnessConfig;
  series: TestSeries;
  shot: TestShot;
  tier: (typeof tierRequests)[keyof typeof tierRequests];
  attemptNumber: number;
  outputRoot: string;
  deps: RunnerDeps;
};

async function attemptOnce(context: AttemptContext): Promise<AttemptRecord> {
  const { config, shot, tier, deps } = context;
  const rendered = renderShotRequest(context.series, shot);
  const startedAt = deps.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), config.attemptTimeoutMs);

  const base = {
    schemaVersion: 1 as const,
    runId: config.runId,
    attemptId: randomUUID(),
    idempotencyKey: attemptIdempotencyKey({
      runId: config.runId,
      operation: generateOperation,
      shotId: shot.id,
      attemptNumber: context.attemptNumber,
    }),
    shotId: shot.id,
    tier: config.tier,
    attemptNumber: context.attemptNumber,
    input: {
      renderedPrompt: rendered.prompt,
      promptSha256: createHash("sha256").update(rendered.prompt).digest("hex"),
      referenceImagePaths: [...rendered.referenceImagePaths],
    },
    requestedAt: startedAt.toISOString(),
  };

  try {
    const submitStartedAt = Date.now();
    const submission = await deps.provider.submit(
      { shot, tier, prompt: rendered.prompt, referenceImagePaths: rendered.referenceImagePaths },
      controller.signal,
    );
    const submitMs = Date.now() - submitStartedAt;

    const provider = {
      id: deps.provider.id,
      model: deps.provider.model,
      taskId: submission.state === "submitted" ? submission.taskId : null,
    };

    if (submission.state === "failed") {
      return finish({
        ...base,
        provider,
        input: { ...base.input, parameters: submission.parameters },
        latencyMs: { submit: submitMs, generate: 0, total: submitMs },
        completedAt: deps.now().toISOString(),
        outcome: "failed",
        failure: failureOf(submission.observation),
        usage: null,
        output: null,
      });
    }

    const generateStartedAt = Date.now();
    const finished = await pollUntilSettled(context, submission.taskId, controller.signal);
    const generateMs = Date.now() - generateStartedAt;
    const latencyMs = { submit: submitMs, generate: generateMs, total: submitMs + generateMs };
    const shared = {
      ...base,
      provider,
      input: { ...base.input, parameters: submission.parameters },
      latencyMs,
      completedAt: deps.now().toISOString(),
    };

    if (finished.state === "failed") {
      return finish({
        ...shared,
        outcome: "failed",
        failure: failureOf(finished.observation),
        usage: null,
        output: null,
      });
    }

    const bytes =
      finished.bytes ??
      (finished.resultUrl === null
        ? null
        : await deps.provider.download(finished.resultUrl, controller.signal));

    if (bytes === null) {
      return finish({
        ...shared,
        outcome: "failed",
        failure: failureOf({
          transport: "responded",
          providerMessage: "the provider reported success but returned no result",
          providerClassHint: "unknown",
        }),
        usage: null,
        output: null,
      });
    }

    const path = join(context.outputRoot, "shots", shot.id, `attempt-${context.attemptNumber}.mp4`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);

    const media = await deps.probe(path);

    return finish({
      ...shared,
      outcome: "succeeded",
      failure: null,
      usage: resolveUsage({
        unit: config.billableUnit,
        unitPriceUsd: config.unitPriceUsd ?? 0,
        media,
        providerComputeSeconds: finished.providerComputeSeconds,
      }),
      output: {
        path,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        media,
        tierDrift: describeTierDrift(media, tier, shot.durationSeconds),
      },
    });
  } finally {
    clearTimeout(deadline);
  }
}

function failureOf(observation: Parameters<typeof classifyFailure>[0]) {
  const classified = classifyFailure(observation);

  return {
    failureClass: classified.failureClass,
    retryDisposition: classified.retryDisposition,
    providerCode: observation.providerCode ?? null,
    providerMessage: observation.providerMessage ?? null,
  };
}

function finish(record: unknown): AttemptRecord {
  return attemptRecordSchema.parse(record);
}

async function pollUntilSettled(
  context: AttemptContext,
  taskId: string | null,
  signal: AbortSignal,
) {
  const { deps, config } = context;

  for (;;) {
    const outcome = await deps.provider.poll(taskId, signal);

    if (outcome.state !== "pending") return outcome;

    if (signal.aborted) {
      // Our deadline, not the provider's. The task may still be running and still
      // be billable, which is why `decideShotAction` sends this to a human rather
      // than resubmitting it.
      return {
        state: "failed" as const,
        observation: {
          transport: "deadline_exceeded" as const,
          providerMessage: `no result within ${config.attemptTimeoutMs}ms`,
        },
      };
    }

    await deps.sleep(config.pollIntervalMs);
  }
}
