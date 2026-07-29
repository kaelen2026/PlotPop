import { z } from "zod";
import type { FailureClass, FailureObservation } from "../failures.js";
import { redactSecrets } from "../records/attempt.js";
import type { ExperimentProvider, PollOutcome, ProviderRequest, SubmitOutcome } from "./adapter.js";

/**
 * The first real video provider adapter for F-00.
 *
 * Chosen for the experiment rather than for the product: one token reaches many
 * video models behind one uniform create/poll shape, which is what lets a
 * comparison run change `PLOTPOP_RESEARCH_MODEL` instead of changing code. It says
 * nothing about who the MVP's primary provider will be — that decision belongs to
 * F-07 and to whatever this experiment measures.
 *
 * **Verify before spending.** The response mapping below follows the documented
 * prediction shape, but a model's *input* field names are per-model, so run
 * `--only shot-01` once and read the record before letting thirty shots go. That
 * one shot costs a shot; a wrong field name across thirty costs thirty.
 *
 * Model-specific input fields go in `PLOTPOP_RESEARCH_MODEL_INPUT` as JSON, so
 * adding `aspect_ratio` or a reference image parameter never needs a code change.
 */

export type ReplicateOptions = {
  readonly baseUrl: string;
  readonly apiToken: string;
  /** Either `owner/name` for an official model, or a bare version id. */
  readonly model: string;
  /** Extra, model-specific `input` fields, merged over the defaults. */
  readonly extraInput: Readonly<Record<string, unknown>>;
};

const predictionSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
  metrics: z.looseObject({ predict_time: z.number().optional() }).optional(),
});

/**
 * Patterns that mean "the content was refused", not "the request was malformed".
 *
 * Word-start anchored only. `content polic` has to match "content policy" too, and
 * a trailing `\b` would refuse it.
 */
const moderationPattern =
  /\b(?:nsfw|content polic|safety|sensitive content|moderat|flagged|not allowed|prohibited)/i;

/**
 * Maps a provider answer onto a failure class.
 *
 * Separated out and tested because the distinction it draws is the expensive one: a
 * moderation rejection must never be retried, and providers report it as a plain
 * 422 or as a `failed` prediction with prose in `error`. Getting this wrong spends
 * the whole retry budget on a request that cannot succeed.
 */
export function classifyReplicateFailure(
  httpStatus: number | undefined,
  errorText: string | null,
): FailureObservation {
  const hint = hintFor(errorText);

  return {
    transport: "responded",
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(errorText === null ? {} : { providerMessage: errorText }),
    ...(hint === null ? {} : { providerClassHint: hint }),
  };
}

function hintFor(errorText: string | null): FailureClass | null {
  if (errorText === null) return null;
  if (moderationPattern.test(errorText)) return "moderation_rejected";

  return null;
}

/** `starting` and `processing` are the two "not finished yet" states. */
const pendingStatuses = new Set(["starting", "processing"]);

function errorTextOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * A video model's output is a URL, or a list of URLs when it returns several
 * candidates. The last entry is the finished render for models that stream
 * intermediate results.
 */
export function outputUrlOf(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const urls = output.filter((entry): entry is string => typeof entry === "string");

    return urls.at(-1) ?? null;
  }

  return null;
}

export function createReplicateProvider(options: ReplicateOptions): ExperimentProvider {
  const headers = {
    Authorization: `Bearer ${options.apiToken}`,
    "Content-Type": "application/json",
  };

  const submitUrl = options.model.includes("/")
    ? `${options.baseUrl}/v1/models/${options.model}/predictions`
    : `${options.baseUrl}/v1/predictions`;

  return {
    id: "replicate",
    model: options.model,

    async submit(request: ProviderRequest, signal: AbortSignal): Promise<SubmitOutcome> {
      const input = {
        prompt: request.prompt,
        duration: request.shot.durationSeconds,
        ...options.extraInput,
      };
      const body = options.model.includes("/") ? { input } : { version: options.model, input };
      // The log gets the body, never the headers: the token is in the headers.
      const parameters = redactSecrets(body, [options.apiToken]) as Record<string, unknown>;

      let response: Response;
      try {
        response = await fetch(submitUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        return {
          state: "failed",
          parameters,
          observation: {
            transport: signal.aborted ? "deadline_exceeded" : "network_error",
            providerMessage: error instanceof Error ? error.message : String(error),
          },
        };
      }

      const text = await response.text();

      if (!response.ok) {
        return {
          state: "failed",
          parameters,
          observation: classifyReplicateFailure(response.status, text),
        };
      }

      return {
        state: "submitted",
        taskId: predictionSchema.parse(JSON.parse(text)).id,
        parameters,
      };
    },

    async poll(taskId: string | null, signal: AbortSignal): Promise<PollOutcome> {
      if (taskId === null) throw new Error("replicate always returns a prediction id");

      let response: Response;
      try {
        response = await fetch(`${options.baseUrl}/v1/predictions/${taskId}`, { headers, signal });
      } catch (error) {
        return {
          state: "failed",
          observation: {
            transport: signal.aborted ? "deadline_exceeded" : "network_error",
            providerMessage: error instanceof Error ? error.message : String(error),
          },
        };
      }

      const text = await response.text();

      if (!response.ok) {
        return { state: "failed", observation: classifyReplicateFailure(response.status, text) };
      }

      const prediction = predictionSchema.parse(JSON.parse(text));

      if (pendingStatuses.has(prediction.status)) return { state: "pending" };

      if (prediction.status === "succeeded") {
        return {
          state: "succeeded",
          resultUrl: outputUrlOf(prediction.output),
          bytes: null,
          providerComputeSeconds: prediction.metrics?.predict_time ?? null,
        };
      }

      return {
        state: "failed",
        observation: {
          ...classifyReplicateFailure(undefined, errorTextOf(prediction.error)),
          providerCode: prediction.status,
        },
      };
    },

    async download(resultUrl: string, signal: AbortSignal): Promise<Uint8Array> {
      // No Authorization header: result urls are pre-signed, and sending the token
      // to whatever host they point at would leak it.
      const response = await fetch(resultUrl, { signal });

      if (!response.ok) {
        throw new Error(`downloading the result failed with HTTP ${response.status}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
