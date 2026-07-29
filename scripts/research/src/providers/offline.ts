import { createHash } from "node:crypto";
import type { MediaFacts } from "../media/ffprobe.js";
import type { QualityTier } from "../tiers.js";
import type { ExperimentProvider, PollOutcome, ProviderRequest, SubmitOutcome } from "./adapter.js";

/**
 * A provider that generates nothing, for exercising the harness without spending.
 *
 * It exists so the whole path — decide, submit, poll, write, probe, log, report —
 * can be run end to end before a token is ever configured, and so the retry and
 * moderation branches are walked at least once by something other than a unit test.
 * Its "clips" are deterministic bytes, not video.
 *
 * Everything it produces is marked: the provider id is `offline`, the unit price is
 * zero, and `reportedByProvider` is false. A dry run's report is a smoke test, and
 * nothing in it may be copied into `unit-economics.md`.
 *
 * The scripted outcomes are derived from a hash of the shot id and the attempt
 * number, so two dry runs produce the same sequence of failures and recoveries, and
 * a change in what a dry run prints is attributable to the code.
 */

export type OfflineProvider = ExperimentProvider & {
  /**
   * The facts the harness would have got from ffprobe. Injected in place of a real
   * probe so a dry run needs no ffmpeg installed.
   */
  factsFor(shotId: string): MediaFacts;
};

function dieRoll(shotId: string, attemptSalt: string): number {
  const digest = createHash("sha256").update(`${shotId}:${attemptSalt}`).digest();

  return digest[0] ?? 0;
}

export function createOfflineProvider(tier: QualityTier): OfflineProvider {
  const facts = new Map<string, MediaFacts>();
  const pending = new Map<string, { request: ProviderRequest; attempt: number }>();
  // The harness does not tell a provider which attempt this is, so the offline one
  // counts for itself. Without it a scripted failure would repeat forever and no
  // shot would ever recover on a retry.
  const attemptsSeen = new Map<string, number>();

  return {
    id: "offline",
    model: `offline/${tier}`,

    factsFor(shotId) {
      const known = facts.get(shotId);
      if (!known) throw new Error(`no offline output was produced for ${shotId}`);

      return known;
    },

    async submit(request: ProviderRequest): Promise<SubmitOutcome> {
      const attempt = (attemptsSeen.get(request.shot.id) ?? 0) + 1;
      attemptsSeen.set(request.shot.id, attempt);

      const parameters = {
        prompt_sha256: createHash("sha256").update(request.prompt).digest("hex"),
        duration: request.shot.durationSeconds,
        width: request.tier.width,
        height: request.tier.height,
        reference_images: request.referenceImagePaths.length,
      };

      // One shot in eight is refused outright, so the not-retryable branch is
      // walked without anybody having to arrange it.
      if (dieRoll(request.shot.id, `submit-${attempt}`) % 8 === 0) {
        return {
          state: "failed",
          parameters,
          observation: {
            transport: "responded",
            httpStatus: 422,
            providerCode: "offline_content_policy",
            providerMessage: "offline provider refuses this prompt on purpose",
            providerClassHint: "moderation_rejected",
          },
        };
      }

      const taskId = `offline-${request.shot.id}-${attempt}`;
      pending.set(taskId, { request, attempt });

      return { state: "submitted", taskId, parameters };
    },

    async poll(taskId: string | null): Promise<PollOutcome> {
      if (taskId === null) throw new Error("the offline provider always returns a task id");

      const task = pending.get(taskId);
      if (!task) throw new Error(`the offline provider has no task ${taskId}`);

      const { request } = task;

      // One attempt in five fails transiently, so the retry-with-backoff branch is
      // walked and some shots recover on a later attempt.
      if (dieRoll(request.shot.id, `poll-${task.attempt}`) % 5 === 0) {
        pending.delete(taskId);

        return {
          state: "failed",
          observation: {
            transport: "responded",
            httpStatus: 503,
            providerMessage: "offline provider is pretending to be unavailable",
          },
        };
      }

      facts.set(request.shot.id, {
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        videoCodec: "h264",
        width: request.tier.width,
        height: request.tier.height,
        frameRate: request.tier.frameRate,
        durationSeconds: request.shot.durationSeconds,
        bitrateBps: null,
        pixelFormat: "yuv420p",
        frameCount: Math.round(request.shot.durationSeconds * request.tier.frameRate),
        audio: null,
      });

      return {
        state: "succeeded",
        resultUrl: null,
        // Deterministic filler, one byte per notional frame. Not a playable file,
        // and the run directory of a dry run is not review material.
        bytes: new Uint8Array(
          Math.round(request.shot.durationSeconds * request.tier.frameRate),
        ).fill(dieRoll(request.shot.id, "bytes")),
        providerComputeSeconds: null,
      };
    },

    async download(): Promise<Uint8Array> {
      throw new Error("the offline provider hands bytes back directly and never downloads");
    },
  };
}
