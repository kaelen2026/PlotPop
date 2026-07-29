import type { BillableUnit } from "../config.js";
import type { MediaFacts } from "../media/ffprobe.js";
import type { BillableUsage } from "../records/attempt.js";

/**
 * Works out what an attempt cost, and whether we know or merely believe it.
 *
 * The billable unit differs per provider and per model — some price a request,
 * some price the delivered video by the second, some price the compute time they
 * spent — so the unit and its price are configuration, and this decides where the
 * quantity comes from.
 *
 * `reportedByProvider` is the part that matters. A quantity the provider stated is
 * evidence. A quantity we measured off the delivered file is a good inference. A
 * quantity we would have had to invent is refused outright: an invented figure
 * reads exactly like a measured one once it reaches `unit-economics.md`.
 */

export type UsageInputs = {
  readonly unit: BillableUnit;
  readonly unitPriceUsd: number;
  readonly media: MediaFacts | null;
  readonly providerComputeSeconds: number | null;
};

const costPrecision = 1e6;

export function resolveUsage(inputs: UsageInputs): BillableUsage | null {
  const measured = quantityOf(inputs);
  if (measured === null) return null;

  return {
    unit: inputs.unit,
    quantity: measured.quantity,
    unitPriceUsd: inputs.unitPriceUsd,
    costUsd: Math.round(measured.quantity * inputs.unitPriceUsd * costPrecision) / costPrecision,
    reportedByProvider: measured.reportedByProvider,
  };
}

function quantityOf(inputs: UsageInputs): { quantity: number; reportedByProvider: boolean } | null {
  switch (inputs.unit) {
    case "request":
      // Exactly one, and nothing had to be measured to know it.
      return { quantity: 1, reportedByProvider: true };

    case "compute_second":
      // Only the provider can know this. Nothing on our side approximates it.
      return inputs.providerComputeSeconds === null
        ? null
        : { quantity: inputs.providerComputeSeconds, reportedByProvider: true };

    case "output_second":
      // The delivered length, not the requested one: a provider that returned 4.6
      // seconds for a 5 second request may well have billed 4.6.
      return inputs.media === null
        ? null
        : { quantity: inputs.media.durationSeconds, reportedByProvider: false };

    case "generated_frame":
      if (inputs.media === null) return null;

      return {
        quantity:
          inputs.media.frameCount ??
          Math.round(inputs.media.durationSeconds * inputs.media.frameRate),
        reportedByProvider: false,
      };
  }
}
